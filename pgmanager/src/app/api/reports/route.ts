import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, bad, handle } from "@/lib/api";
import { todayYm, periodLabel, periodStart, addMonths } from "@/lib/dates";

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

    // collections
    const invoices = await db.rentInvoice.findMany({
      where: { period: month },
      include: { tenancy: { include: { tenant: true } } },
    });
    const expected = invoices.reduce((s, i) => s + Number(i.dueAmount), 0);
    const collected = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);

    // expenses
    const expenses = await db.expense.findMany({
      where: { date: { gte: monthStart, lt: nextMonthStart } },
    });
    const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const byCategory = new Map<string, number>();
    for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount));

    // 12-month performance
    const yearPeriods = Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11));
    const [invAgg, allExp] = await Promise.all([
      db.rentInvoice.groupBy({
        by: ["period"],
        where: { period: { in: yearPeriods } },
        _sum: { dueAmount: true, paidAmount: true },
      }),
      db.expense.findMany({
        where: { date: { gte: periodStart(yearPeriods[0]), lt: nextMonthStart } },
        select: { date: true, amount: true },
      }),
    ]);
    const yearSeries = yearPeriods.map((p) => {
      const inv = invAgg.find((a) => a.period === p);
      const exp = allExp
        .filter((e) => `${e.date.getUTCFullYear()}-${String(e.date.getUTCMonth() + 1).padStart(2, "0")}` === p)
        .reduce((s, e) => s + Number(e.amount), 0);
      return {
        period: p,
        label: periodLabel(p),
        collected: Number(inv?._sum.paidAmount ?? 0),
        expenses: exp,
        profit: Number(inv?._sum.paidAmount ?? 0) - exp,
      };
    });

    // debtor aging across ALL open invoices
    const openInvoices = await db.rentInvoice.findMany({
      where: { status: { in: ["DUE", "PARTIAL", "OVERDUE"] } },
      include: { tenancy: { include: { tenant: true, bed: { include: { room: true } } } } },
    });
    const aging = { "0-30d": 0, "31-60d": 0, "60d+": 0 } as Record<string, number>;
    const debtors = openInvoices
      .map((i) => ({
        name: i.tenancy.tenant.name,
        room: `${i.tenancy.bed.room.number}-${i.tenancy.bed.label}`,
        period: i.period,
        outstanding: Math.max(0, Number(i.dueAmount) - Number(i.paidAmount)),
        status: i.status,
      }))
      .filter((d) => d.outstanding > 0);
    const now = periodStart(month).getTime();
    for (const d of debtors) {
      const ageDays = Math.round((now - periodStart(d.period).getTime()) / 86400000);
      if (ageDays <= 30) aging["0-30d"] += d.outstanding;
      else if (ageDays <= 60) aging["31-60d"] += d.outstanding;
      else aging["60d+"] += d.outstanding;
    }

    // method split
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

    return ok({
      month,
      label: periodLabel(month),
      collections: {
        expected,
        collected,
        pending: Math.max(0, expected - collected),
        collectionRate: expected > 0 ? Math.round((collected / expected) * 100) : 0,
        paid: invoices.filter((i) => i.status === "PAID").length,
        partial: invoices.filter((i) => i.status === "PARTIAL").length,
        due: invoices.filter((i) => i.status === "DUE").length,
        overdue: invoices.filter((i) => i.status === "OVERDUE").length,
      },
      expenses: {
        total: expenseTotal,
        byCategory: [...byCategory.entries()]
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount),
      },
      profit: collected - expenseTotal,
      yearSeries,
      aging,
      debtors: debtors.sort((a, b) => b.outstanding - a.outstanding).slice(0, 15),
      methodSplit: [...methodSplit.entries()].map(([method, v]) => ({ method, ...v })),
    });
  });
}
