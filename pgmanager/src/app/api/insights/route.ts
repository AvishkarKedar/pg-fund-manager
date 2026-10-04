import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, handle } from "@/lib/api";
import { todayYm, periodLabel, periodStart, addMonths } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI Insights: uses the LLM (z-ai-web-dev-sdk, backend-only) to turn this
 * month's numbers into 3 short insights + 1 recommendation. Falls back to
 * deterministic local insights if the model is unavailable.
 */
export async function GET() {
  return handle(async () => {
    const { response } = await requireAuth();
    if (response) return response;

    const month = todayYm();
    const monthStart = periodStart(month);
    const nextMonthStart = periodStart(addMonths(month, 1));

    const [invoices, expenses, beds, activeTenancies] = await Promise.all([
      db.rentInvoice.findMany({
        where: { period: month },
        include: { tenancy: { include: { tenant: true, bed: { include: { room: true } } } } },
      }),
      db.expense.findMany({ where: { date: { gte: monthStart, lt: nextMonthStart } } }),
      db.bed.count({ where: { isActive: true } }),
      db.tenancy.count({ where: { isActive: true } }),
    ]);

    const expected = invoices.reduce((s, i) => s + Number(i.dueAmount), 0);
    const collected = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
    const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const debtors = invoices
      .filter((i) => Number(i.dueAmount) - Number(i.paidAmount) > 0 && i.tenancy.isActive)
      .map((i) => ({
        name: i.tenancy.tenant.name,
        room: `${i.tenancy.bed.room.number}-${i.tenancy.bed.label}`,
        outstanding: Number(i.dueAmount) - Number(i.paidAmount),
        status: i.status,
      }))
      .sort((a, b) => b.outstanding - a.outstanding);

    const facts = {
      month: periodLabel(month),
      beds,
      occupied: activeTenancies,
      occupancyRate: beds > 0 ? Math.round((activeTenancies / beds) * 100) : 0,
      expectedRent: expected,
      collected,
      collectionRate: expected > 0 ? Math.round((collected / expected) * 100) : 0,
      expenses: expenseTotal,
      netIncome: collected - expenseTotal,
      topExpense: [...expenses.reduce((m, e) => m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount)), new Map<string, number>())]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([category, amount]) => ({ category, amount })),
      debtors: debtors.slice(0, 6),
    };

    const fallback = buildFallbackInsights(facts);

    try {
      // Optional dependency: if z-ai-web-dev-sdk is installed, use the LLM;
      // otherwise fall through to deterministic local insights.
      const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<{ default?: { create: () => Promise<{ chat: { completions: { create: (args: unknown) => Promise<{ choices?: Array<{ message?: { content?: string } }> } } } } }> } }>;
      const mod = await dynamicImport("z-ai-web-dev-sdk").catch(() => null);
      if (!mod?.default) throw new Error("LLM SDK not installed — using local insights");
      const zai = await mod.default.create();
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "assistant",
            content:
              "You are a concise property-finance analyst for an Indian paying-guest (PG) accommodation. Given JSON facts, return STRICT JSON only: {\"insights\":[\"...\",\"...\",\"...\"],\"recommendation\":\"...\"} — 3 insights (each ≤ 20 words, mention concrete numbers) and 1 actionable recommendation (≤ 25 words). Use ₹ figures. No markdown, no extra keys.",
          },
          {
            role: "user",
            content: JSON.stringify(facts),
          },
        ],
        thinking: { type: "disabled" },
      });

      const raw = completion.choices[0]?.message?.content ?? "";
      const jsonMatch = /\{[\s\S]*\}/.exec(raw);
      if (!jsonMatch) return ok({ insights: fallback, source: "local" });
      const parsed = JSON.parse(jsonMatch[0]) as { insights?: string[]; recommendation?: string };
      if (!Array.isArray(parsed.insights) || parsed.insights.length === 0) {
        return ok({ insights: fallback, source: "local" });
      }
      return ok({
        insights: {
          insights: parsed.insights.slice(0, 3),
          recommendation: parsed.recommendation ?? fallback.recommendation,
        },
        source: "ai",
      });
    } catch {
      return ok({ insights: fallback, source: "local" });
    }
  });
}

interface Facts {
  month: string; beds: number; occupied: number; occupancyRate: number;
  expectedRent: number; collected: number; collectionRate: number;
  expenses: number; netIncome: number;
  topExpense: { category: string; amount: number }[];
  debtors: { name: string; room: string; outstanding: number; status: string }[];
}

function buildFallbackInsights(f: Facts) {
  const insights: string[] = [];
  insights.push(
    `Collected ₹${f.collected.toLocaleString("en-IN")} of ₹${f.expectedRent.toLocaleString("en-IN")} (${f.collectionRate}%) for ${f.month}.`
  );
  if (f.debtors.length > 0) {
    const top = f.debtors[0];
    insights.push(
      `${f.debtors.length} tenant(s) owe rent — largest: ${top.name} (${top.room}) at ₹${top.outstanding.toLocaleString("en-IN")}.`
    );
  } else {
    insights.push("Every tenant has settled this month's rent — no follow-ups needed.");
  }
  if (f.expenses > 0) {
    const top = f.topExpense[0];
    insights.push(
      `Expenses ₹${f.expenses.toLocaleString("en-IN")} — ${top ? `${top.category.toLowerCase()} is the biggest cost at ₹${top.amount.toLocaleString("en-IN")}` : "spread across categories"}. Net ₹${f.netIncome.toLocaleString("en-IN")}.`
    );
  }
  insights.push(`Occupancy at ${f.occupancyRate}% (${f.occupied}/${f.beds} beds).`);
  const recommendation =
    f.collectionRate < 90 && f.debtors.length > 0
      ? `Send WhatsApp reminders to the ${f.debtors.length} unpaid tenant(s) today; the largest gap is ${f.debtors[0]?.name}.`
      : f.occupancyRate < 80
        ? `${f.beds - f.occupied} beds are vacant — consider a limited-period offer or listing refresh.`
        : "Collections are healthy — schedule the month-end expense review and bank reconciliation.";
  return { insights: insights.slice(0, 3), recommendation };
}
