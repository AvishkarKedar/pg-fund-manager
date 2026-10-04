import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, bad, handle } from "@/lib/api";
import {
  todayYm,
  todayIST,
  periodLabel,
  addMonths,
  periodStart,
} from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const { response } = await requireAuth();
    if (response) return response;

    const url = new URL(req.url);
    const month = url.searchParams.get("month") || todayYm();
    if (!/^\d{4}-\d{2}$/.test(month)) return bad("Invalid month");

    const monthStart = periodStart(month);
    const nextMonthStart = periodStart(addMonths(month, 1));

    // beds + occupancy
    const [totalBeds, activeTenancies, tenants] = await Promise.all([
      db.bed.count({ where: { isActive: true } }),
      db.tenancy.findMany({
        where: { isActive: true },
        include: {
          bed: { include: { room: true } },
          tenant: true,
        },
      }),
      db.tenant.count({ where: { status: "ACTIVE" } }),
    ]);
    const occupiedBeds = activeTenancies.length;

    // rent status for the month
    const invoices = await db.rentInvoice.findMany({
      where: { period: month },
      include: {
        tenancy: {
          include: { tenant: true, bed: { include: { room: true } } },
        },
      },
    });
    const rentStatus = { PAID: 0, PARTIAL: 0, DUE: 0, OVERDUE: 0, WAIVED: 0 } as Record<string, number>;
    let expected = 0;
    let collected = 0;
    const debtors: {
      tenantId: string; name: string; room: string; bed: string;
      outstanding: number; phone: string | null; status: string;
    }[] = [];
    for (const i of invoices) {
      if (!i.tenancy.isActive) continue;
      rentStatus[i.status] = (rentStatus[i.status] ?? 0) + 1;
      expected += Number(i.dueAmount);
      collected += Number(i.paidAmount);
      const outstanding = Number(i.dueAmount) - Number(i.paidAmount);
      if (outstanding > 0 && i.status !== "WAIVED") {
        debtors.push({
          tenantId: i.tenancy.tenantId,
          name: i.tenancy.tenant.name,
          room: i.tenancy.bed.room.number,
          bed: i.tenancy.bed.label,
          outstanding,
          phone: i.tenancy.tenant.phone,
          status: i.status,
        });
      }
    }
    debtors.sort((a, b) => b.outstanding - a.outstanding);

    // expenses for the month
    const expenses = await db.expense.findMany({
      where: { date: { gte: monthStart, lt: nextMonthStart } },
    });
    const expensesThisMonth = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const byCategory = new Map<string, number>();
    for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount));

    // 6-month series (collections vs expenses)
    const seriesPeriods = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
    const [invAgg, expAgg] = await Promise.all([
      db.rentInvoice.groupBy({
        by: ["period"],
        where: { period: { in: seriesPeriods } },
        _sum: { dueAmount: true, paidAmount: true },
      }),
      db.expense.findMany({
        where: { date: { gte: periodStart(seriesPeriods[0]), lt: nextMonthStart } },
        select: { date: true, amount: true },
      }),
    ]);
    const monthlySeries = seriesPeriods.map((p) => {
      const inv = invAgg.find((a) => a.period === p);
      const exp = expAgg
        .filter((e) => `${e.date.getUTCFullYear()}-${String(e.date.getUTCMonth() + 1).padStart(2, "0")}` === p)
        .reduce((s, e) => s + Number(e.amount), 0);
      return {
        period: p,
        label: periodLabel(p),
        expected: Number(inv?._sum.dueAmount ?? 0),
        collected: Number(inv?._sum.paidAmount ?? 0),
        expenses: exp,
      };
    });

    // occupancy by floor
    const rooms = await db.room.findMany({
      include: { beds: { where: { isActive: true }, include: { tenancies: { where: { isActive: true } } } } },
      orderBy: { floor: "asc" },
    });
    const floorMap = new Map<number, { total: number; occupied: number }>();
    for (const r of rooms) {
      const entry = floorMap.get(r.floor) ?? { total: 0, occupied: 0 };
      entry.total += r.beds.length;
      entry.occupied += r.beds.filter((b) => b.tenancies.length > 0).length;
      floorMap.set(r.floor, entry);
    }
    const occupancyByFloor = [...floorMap.entries()]
      .map(([floor, v]) => ({ floor, ...v }))
      .sort((a, b) => a.floor - b.floor);

    // payment method split for the month
    const payments = await db.payment.findMany({
      where: { date: { gte: monthStart, lt: nextMonthStart }, reversedAt: null },
    });
    const methodSplit = new Map<string, { amount: number; count: number }>();
    for (const p of payments) {
      const entry = methodSplit.get(p.method) ?? { amount: 0, count: 0 };
      entry.amount += Number(p.amount);
      entry.count += 1;
      methodSplit.set(p.method, entry);
    }

    // recent activity (payments + expenses merged)
    const [recentPayments, recentExpenses] = await Promise.all([
      db.payment.findMany({
        take: 8,
        orderBy: { date: "desc" },
        where: { reversedAt: null },
        include: { tenant: true },
      }),
      db.expense.findMany({ take: 6, orderBy: { date: "desc" } }),
    ]);
    const activity: { id: string; type: string; text: string; amount: number; at: string }[] = [
      ...recentPayments.map((p) => ({
        id: `p-${p.id}`,
        type: "PAYMENT",
        text: `${p.tenant.name} paid rent`,
        amount: Number(p.amount),
        at: p.date.toISOString(),
      })),
      ...recentExpenses.map((e) => ({
        id: `e-${e.id}`,
        type: "EXPENSE",
        text: `${e.category.toLowerCase()} expense${e.vendor ? ` — ${e.vendor}` : ""}`,
        amount: Number(e.amount),
        at: e.date.toISOString(),
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    return ok({
      month,
      monthLabel: periodLabel(month),
      isCurrentMonth: month === todayYm(),
      today: todayIST().toISOString(),
      stats: {
        totalBeds,
        occupiedBeds,
        vacantBeds: totalBeds - occupiedBeds,
        occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        activeTenants: tenants,
        expectedRent: expected,
        collected,
        pending: Math.max(0, expected - collected),
        overdueCount: rentStatus.OVERDUE,
        overdueAmount: debtors.filter((d) => d.status === "OVERDUE").reduce((s, d) => s + d.outstanding, 0),
        expensesThisMonth,
        netIncome: collected - expensesThisMonth,
      },
      rentStatus,
      monthlySeries,
      occupancyByFloor,
      debtors: debtors.slice(0, 8),
      expenseBreakdown: [...byCategory.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
      methodSplit: [...methodSplit.entries()].map(([method, v]) => ({ method, ...v })),
      recentActivity: activity.slice(0, 12),
    });
  });
}
