import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { checkoutTenancy } from "@/lib/rent-engine";
import { todayIST } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;
    const { id } = await ctx.params;

    const tenant = await db.tenant.findUnique({
      where: { id },
      include: { tenancies: { where: { isActive: true }, include: { bed: { include: { room: true } } } } },
    });
    if (!tenant) return bad("Tenant not found", 404);
    const current = tenant.tenancies[0];
    if (!current) return bad("Tenant has no active tenancy", 409);

    const body = await readJson<{
      endDate?: string; depositReturned?: number; deductions?: number; notes?: string;
    }>(req);

    const endDate = body.endDate ? new Date(body.endDate) : todayIST();
    if (isNaN(endDate.getTime())) return bad("Invalid check-out date");

    // settlement preview computed server-side — the numbers the UI shows
    const openInvoices = await db.rentInvoice.findMany({
      where: { tenancyId: current.id, status: { in: ["DUE", "PARTIAL", "OVERDUE"] } },
    });
    const outstanding = openInvoices.reduce(
      (s, i) => s + Math.max(0, Number(i.dueAmount) - Number(i.paidAmount)),
      0
    );
    const deposit = Number(current.securityDeposit);
    const deductions = Number(body.deductions ?? 0);
    const depositReturned = Number(body.depositReturned ?? Math.max(0, deposit - deductions - outstanding));

    await checkoutTenancy(current.id, endDate);

    if (body.notes) {
      await db.tenant.update({ where: { id }, data: { notes: body.notes } });
    }

    await audit(user.id, "CHECKOUT", "Tenant", id, {
      name: tenant.name,
      room: `${current.bed.room.number}-${current.bed.label}`,
      endDate,
      outstanding,
      deposit,
      deductions,
      depositReturned,
    });

    return ok({
      success: true,
      settlement: { outstanding, deposit, deductions, depositReturned },
      room: current.bed.room.number,
    });
  });
}
