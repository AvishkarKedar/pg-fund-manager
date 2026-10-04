import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, bad, handle } from "@/lib/api";
import { ensureInvoices, refreshStatuses } from "@/lib/rent-engine";
import { todayYm, periodLabel, addMonths } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const { response } = await requireAuth();
    if (response) return response;

    const url = new URL(req.url);
    const month = url.searchParams.get("month") || todayYm();
    if (!/^\d{4}-\d{2}$/.test(month)) return bad("Invalid month format");

    // auto roll-over + status refresh on every read (fixes the legacy
    // "paid flags only reset on reload" bug by design)
    await ensureInvoices(month);
    await refreshStatuses(month);

    const invoices = await db.rentInvoice.findMany({
      where: { period: month, tenancy: { isActive: true } },
      include: {
        tenancy: {
          include: { tenant: true, bed: { include: { room: true } } },
        },
      },
      orderBy: [{ status: "desc" }, { tenancy: { bed: { room: { floor: "asc" } } } }],
    });

    const rows = invoices.map((i) => ({
      invoiceId: i.id,
      tenancyId: i.tenancyId,
      tenantId: i.tenancy.tenantId,
      name: i.tenancy.tenant.name,
      phone: i.tenancy.tenant.phone,
      status: i.tenancy.tenant.status,
      room: i.tenancy.bed.room.number,
      bed: i.tenancy.bed.label,
      rent: Number(i.tenancy.monthlyRent),
      dueDay: i.tenancy.dueDay,
      due: Number(i.dueAmount),
      paid: Number(i.paidAmount),
      outstanding: Math.max(0, Number(i.dueAmount) - Number(i.paidAmount)),
      invoiceStatus: i.status,
      dueDate: i.dueDate,
      method: i.method,
      reference: i.reference,
      paidOn: i.paidOn,
    }));

    const expected = rows.reduce((s, r) => s + r.due, 0);
    const collected = rows.reduce((s, r) => s + r.paid, 0);
    const counts = { PAID: 0, PARTIAL: 0, DUE: 0, OVERDUE: 0, WAIVED: 0 } as Record<string, number>;
    for (const r of rows) counts[r.invoiceStatus] = (counts[r.invoiceStatus] ?? 0) + 1;

    // 6-month history for the trend header
    const historyPeriods = Array.from({ length: 6 }, (_, k) => addMonths(month, k - 5));
    const historyInvoices = await db.rentInvoice.groupBy({
      by: ["period"],
      where: { period: { in: historyPeriods } },
      _sum: { dueAmount: true, paidAmount: true },
    });
    const history = historyPeriods.map((p) => {
      const hit = historyInvoices.find((h) => h.period === p);
      return {
        period: p,
        label: periodLabel(p),
        expected: Number(hit?._sum.dueAmount ?? 0),
        collected: Number(hit?._sum.paidAmount ?? 0),
      };
    });

    return ok({
      month,
      label: periodLabel(month),
      prevMonth: addMonths(month, -1),
      nextMonth: addMonths(month, 1),
      isCurrent: month === todayYm(),
      totals: {
        expected,
        collected,
        pending: Math.max(0, expected - collected),
        counts,
        activeTenancies: rows.length,
      },
      history,
      rows,
    });
  });
}
