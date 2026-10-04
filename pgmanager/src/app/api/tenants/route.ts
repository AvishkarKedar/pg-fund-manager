import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { Decimal } from "decimal.js";
import { todayYm, ym, todayIST } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const { response } = await requireAuth();
    if (response) return response;

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const status = url.searchParams.get("status") ?? "";
    const month = url.searchParams.get("month") || todayYm();

    const tenants = await db.tenant.findMany({
      orderBy: { name: "asc" },
      include: {
        tenancies: {
          where: { isActive: true },
          include: { bed: { include: { room: true } } },
        },
      },
    });

    const invoices = await db.rentInvoice.findMany({
      where: { period: month },
      include: { tenancy: { select: { tenantId: true } } },
    });
    const invoiceByTenant = new Map(invoices.map((i) => [i.tenancy.tenantId, i]));

    let list = tenants.map((t) => {
      const tenancy = t.tenancies[0] ?? null;
      const inv = tenancy ? invoiceByTenant.get(t.id) : null;
      return {
        id: t.id,
        name: t.name,
        phone: t.phone,
        email: t.email,
        status: t.status,
        workplace: t.workplace,
        room: tenancy?.bed.room.number ?? null,
        bed: tenancy?.bed.label ?? null,
        bedId: tenancy?.bedId ?? null,
        monthlyRent: tenancy ? Number(tenancy.monthlyRent) : null,
        dueDay: tenancy?.dueDay ?? null,
        deposit: tenancy ? Number(tenancy.securityDeposit) : null,
        joined: tenancy?.startDate ?? null,
        tenancyId: tenancy?.id ?? null,
        current: inv
          ? {
              invoiceId: inv.id,
              period: inv.period,
              due: Number(inv.dueAmount),
              paid: Number(inv.paidAmount),
              outstanding: Math.max(0, Number(inv.dueAmount) - Number(inv.paidAmount)),
              status: inv.status,
            }
          : null,
      };
    });

    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.phone ?? "").toLowerCase().includes(q) ||
          (t.room ?? "").toLowerCase().includes(q)
      );
    }
    if (status) list = list.filter((t) => t.status === status);

    return ok({ tenants: list, month });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const body = await readJson<{
      name?: string; phone?: string; email?: string; idType?: string; idNumber?: string;
      emergencyContact?: string; workplace?: string; notes?: string;
      bedId?: string; monthlyRent?: number; securityDeposit?: number; dueDay?: number;
      startDate?: string; createInvoice?: boolean;
    }>(req);

    const name = String(body.name ?? "").trim();
    if (!name) return bad("Tenant name is required");
    const phone = body.phone?.trim() || null;
    if (phone && !/^[+\d][\d\s-]{6,17}$/.test(phone)) return bad("Phone number looks invalid");

    let bed = null;
    if (body.bedId) {
      bed = await db.bed.findUnique({
        where: { id: body.bedId },
        include: { room: true, tenancies: { where: { isActive: true } } },
      });
      if (!bed) return bad("Bed not found", 404);
      if (bed.tenancies.length > 0) return bad(`Bed ${bed.room.number}-${bed.label} is already occupied`, 409);
    }

    const rent = bed ? Number(body.monthlyRent ?? bed.room.defaultRent) : Number(body.monthlyRent ?? 0);
    if (!isFinite(rent) || rent < 0) return bad("Monthly rent must be a positive number");
    const deposit = Number(body.securityDeposit ?? 0);
    if (!isFinite(deposit) || deposit < 0) return bad("Deposit must be a positive number");
    const dueDay = Number(body.dueDay ?? 5);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return bad("Due day must be 1–28");

    const startDate = body.startDate ? new Date(body.startDate) : todayIST();
    if (isNaN(startDate.getTime())) return bad("Invalid joining date");

    const tenant = await db.tenant.create({
      data: {
        name,
        phone,
        email: body.email?.trim() || null,
        idType: body.idType || null,
        idNumber: body.idNumber?.trim() || null,
        emergencyContact: body.emergencyContact?.trim() || null,
        workplace: body.workplace?.trim() || null,
        notes: body.notes?.trim() || null,
        status: "ACTIVE",
      },
    });

    if (bed) {
      const tenancy = await db.tenancy.create({
        data: {
          tenantId: tenant.id,
          bedId: bed.id,
          startDate,
          monthlyRent: new Decimal(rent),
          securityDeposit: new Decimal(deposit),
          dueDay,
          isActive: true,
        },
      });
      // invoice for the current month if they joined before month end
      const period = ym(startDate);
      const cur = todayYm();
      if (period <= cur) {
        await db.rentInvoice.create({
          data: {
            tenancyId: tenancy.id,
            period: cur,
            dueAmount: new Decimal(rent),
            paidAmount: new Decimal(0),
            status: "DUE",
            dueDate: new Date(),
          },
        }).catch(() => null);
      }
      await audit(user.id, "CREATED", "Tenant", tenant.id, {
        name,
        room: `${bed.room.number}-${bed.label}`,
        rent,
      });
    } else {
      await audit(user.id, "CREATED", "Tenant", tenant.id, { name, unassigned: true });
    }

    return ok({ tenant: { id: tenant.id, name } }, { status: 201 });
  });
}
