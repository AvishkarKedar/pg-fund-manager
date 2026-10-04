import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { parseFlexibleDate, todayIST, ym, periodLabel } from "@/lib/dates";
import { EXPENSE_CATEGORIES } from "@/lib/money";
import { Decimal } from "decimal.js";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const { response } = await requireAuth();
    if (response) return response;

    const url = new URL(req.url);
    const month = url.searchParams.get("month") ?? "";
    const category = url.searchParams.get("category") ?? "";

    const where: Record<string, unknown> = {};
    if (/^\d{4}-\d{2}$/.test(month)) {
      const start = parseFlexibleDate(`${month}-01`)!;
      const [y, m] = month.split("-").map(Number);
      const end = new Date(Date.UTC(y, m, 1)); // first day of next month — no Feb-31 overshoot
      where.date = { gte: start, lt: end };
    }
    if (category) where.category = category;

    const expenses = await db.expense.findMany({
      where,
      orderBy: { date: "desc" },
    });

    const byCategory = new Map<string, number>();
    for (const e of expenses) {
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount));
    }

    // 6-month trend
    const cur = ym(todayIST());
    const trendPeriods = Array.from({ length: 6 }, (_, i) => {
      const [y, m] = cur.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 - (5 - i), 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    });
    const all = await db.expense.findMany({ select: { date: true, amount: true } });
    const trend = trendPeriods.map((p) => {
      const sum = all
        .filter((e) => `${e.date.getUTCFullYear()}-${String(e.date.getUTCMonth() + 1).padStart(2, "0")}` === p)
        .reduce((s, e) => s + Number(e.amount), 0);
      return { period: p, label: periodLabel(p), amount: sum };
    });

    return ok({
      expenses: expenses.map((e) => ({
        id: e.id,
        date: e.date,
        category: e.category,
        amount: Number(e.amount),
        vendor: e.vendor,
        notes: e.notes,
      })),
      summary: {
        total: expenses.reduce((s, e) => s + Number(e.amount), 0),
        count: expenses.length,
        byCategory: [...byCategory.entries()]
          .map(([cat, amount]) => ({ category: cat, amount }))
          .sort((a, b) => b.amount - a.amount),
      },
      trend,
      categories: [...EXPENSE_CATEGORIES],
    });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const body = await readJson<{
      date?: string; category?: string; amount?: number; vendor?: string; notes?: string;
    }>(req);

    const category = String(body.category ?? "OTHER");
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
      return bad("Invalid expense category");
    }
    const amount = Number(body.amount);
    if (!isFinite(amount) || amount <= 0) return bad("Amount must be greater than zero");
    const date = body.date ? parseFlexibleDate(body.date) : todayIST();
    if (!date) return bad("Invalid date");

    const expense = await db.expense.create({
      data: {
        date,
        category,
        amount: new Decimal(amount),
        vendor: body.vendor?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    });
    await audit(user.id, "CREATED", "Expense", expense.id, { category, amount });
    return ok({ expense: { ...expense, amount: Number(expense.amount) } }, { status: 201 });
  });
}
