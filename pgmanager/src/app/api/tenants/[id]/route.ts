import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { Decimal } from "decimal.js";
import { todayYm } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { response } = await requireAuth();
    if (response) return response;
    const { id } = await ctx.params;

    const tenant = await db.tenant.findUnique({
      where: { id },
      include: {
        tenancies: {
          orderBy: { startDate: "desc" },
          include: { bed: { include: { room: true } } },
        },
        payments: { orderBy: { date: "desc" }, where: { reversedAt: null } },
      },
    });
    if (!tenant) return bad("Tenant not found", 404);

    const current = tenant.tenancies.find((t) => t.isActive) ?? null;
    const invoices = current
      ? await db.rentInvoice.findMany({
          where: { tenancyId: current.id },
          orderBy: { period: "desc" },
        })
      : [];

    const outstanding = invoices
      .filter((i) => i.status !== "WAIVED")
      .reduce((s, i) => s + Math.max(0, Number(i.dueAmount) - Number(i.paidAmount)), 0);
    const totalPaid = tenant.payments.reduce((s, p) => s + Number(p.amount), 0);

    // payment reliability for the current tenancy:
    // a period is on-time when fully paid on or before its due date (dates are
    // UTC midnights, but compare calendar days so a same-day payment with a
    // time component still counts). Streak runs backwards from the most
    // recent period and stops at the first non-on-time one; waived periods
    // are neutral (neither owed nor settled) and are skipped.
    const calendarDay = (d: Date) => Math.floor(d.getTime() / 86400000);
    let streak = 0;
    let streakBroken = false;
    let onTimeCount = 0;
    let totalCount = 0;
    for (const i of invoices) {
      if (i.status === "WAIVED") continue;
      totalCount++;
      const onTime =
        i.status === "PAID" &&
        !!i.paidOn &&
        !!i.dueDate &&
        calendarDay(i.paidOn) <= calendarDay(i.dueDate);
      if (onTime) onTimeCount++;
      if (!streakBroken) {
        if (onTime) streak++;
        else streakBroken = true;
      }
    }
    const reliability = {
      streak,
      onTimeCount,
      totalCount,
      onTimeRate: totalCount > 0 ? Math.round((onTimeCount / totalCount) * 100) : null,
    };

    return ok({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        phone: tenant.phone,
        email: tenant.email,
        idType: tenant.idType,
        idNumber: tenant.idNumber,
        emergencyContact: tenant.emergencyContact,
        workplace: tenant.workplace,
        notes: tenant.notes,
        status: tenant.status,
        createdAt: tenant.createdAt,
      },
      currentTenancy: current
        ? {
            id: current.id,
            room: current.bed.room.number,
            bed: current.bed.label,
            bedId: current.bedId,
            monthlyRent: Number(current.monthlyRent),
            securityDeposit: Number(current.securityDeposit),
            dueDay: current.dueDay,
            startDate: current.startDate,
            noticeDate: current.noticeDate,
          }
        : null,
      tenancies: tenant.tenancies.map((t) => ({
        id: t.id,
        room: t.bed.room.number,
        bed: t.bed.label,
        startDate: t.startDate,
        endDate: t.endDate,
        monthlyRent: Number(t.monthlyRent),
        isActive: t.isActive,
      })),
      invoices: invoices.map((i) => ({
        id: i.id,
        period: i.period,
        due: Number(i.dueAmount),
        paid: Number(i.paidAmount),
        status: i.status,
        dueDate: i.dueDate,
        method: i.method,
        reference: i.reference,
      })),
      payments: tenant.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        date: p.date,
        method: p.method,
        reference: p.reference,
        receiptNumber: p.receiptNumber,
        notes: p.notes,
        reversedAt: p.reversedAt,
      })),
      outstanding,
      totalPaid,
      reliability,
    });
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;
    const { id } = await ctx.params;

    const tenant = await db.tenant.findUnique({ where: { id } });
    if (!tenant) return bad("Tenant not found", 404);

    const body = await readJson<{
      name?: string; phone?: string; email?: string; idType?: string; idNumber?: string;
      emergencyContact?: string; workplace?: string; notes?: string;
      monthlyRent?: number; dueDay?: number; noticeDate?: string | null;
      transferToBedId?: string; clearNotice?: boolean;
    }>(req);

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return bad("Name cannot be empty");
      data.name = name;
    }
    if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
    if (body.email !== undefined) data.email = body.email?.trim() || null;
    if (body.idType !== undefined) data.idType = body.idType || null;
    if (body.idNumber !== undefined) data.idNumber = body.idNumber?.trim() || null;
    if (body.emergencyContact !== undefined) data.emergencyContact = body.emergencyContact?.trim() || null;
    if (body.workplace !== undefined) data.workplace = body.workplace?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

    // notice handling
    if (body.clearNotice) {
      data.status = "ACTIVE";
      data.notes = tenant.notes;
      const current = await db.tenancy.findFirst({ where: { tenantId: id, isActive: true } });
      if (current) {
        await db.tenancy.update({ where: { id: current.id }, data: { noticeDate: null } });
      }
    } else if (body.noticeDate !== undefined) {
      const noticeDate = body.noticeDate ? new Date(body.noticeDate) : new Date();
      data.status = "NOTICE";
      const current = await db.tenancy.findFirst({ where: { tenantId: id, isActive: true } });
      if (current) {
        await db.tenancy.update({ where: { id: current.id }, data: { noticeDate } });
      }
    }

    await db.tenant.update({ where: { id }, data });

    // rent / due-day adjustments on the active tenancy
    const current = await db.tenancy.findFirst({ where: { tenantId: id, isActive: true } });
    if (current) {
      const tData: Record<string, unknown> = {};
      if (body.monthlyRent !== undefined) {
        const rent = Number(body.monthlyRent);
        if (!isFinite(rent) || rent < 0) return bad("Monthly rent must be positive");
        tData.monthlyRent = new Decimal(rent);
      }
      if (body.dueDay !== undefined) {
        const dueDay = Number(body.dueDay);
        if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return bad("Due day must be 1–28");
        tData.dueDay = dueDay;
      }
      if (Object.keys(tData).length > 0) {
        await db.tenancy.update({ where: { id: current.id }, data: tData });
        // keep the current month's open invoice in sync with the new rent
        await db.rentInvoice.updateMany({
          where: { tenancyId: current.id, period: todayYm(), status: { in: ["DUE", "OVERDUE"] } },
          data: tData.monthlyRent !== undefined ? { dueAmount: tData.monthlyRent } : {},
        });
      }

      // transfer: history-preserving bed move
      if (body.transferToBedId && body.transferToBedId !== current.bedId) {
        const target = await db.bed.findUnique({
          where: { id: body.transferToBedId },
          include: { room: true, tenancies: { where: { isActive: true } } },
        });
        if (!target) return bad("Target bed not found", 404);
        if (target.tenancies.length > 0) return bad(`Bed ${target.room.number}-${target.label} is occupied`, 409);
        const today = new Date();
        await db.tenancy.update({
          where: { id: current.id },
          data: { isActive: false, endDate: today },
        });
        await db.tenancy.create({
          data: {
            tenantId: id,
            bedId: target.id,
            startDate: today,
            monthlyRent: body.monthlyRent !== undefined ? new Decimal(Number(body.monthlyRent)) : current.monthlyRent,
            securityDeposit: current.securityDeposit,
            dueDay: body.dueDay !== undefined ? Number(body.dueDay) : current.dueDay,
            isActive: true,
            notes: `Transferred from bed ${current.bedId}`,
          },
        });
        await audit(user.id, "UPDATED", "Tenant", id, { transferred: `${target.room.number}-${target.label}` });
      }
    }

    await audit(user.id, "UPDATED", "Tenant", id, { fields: Object.keys(body) });
    return ok({ success: true });
  });
}
