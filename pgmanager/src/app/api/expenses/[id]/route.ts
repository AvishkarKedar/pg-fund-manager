import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { parseFlexibleDate } from "@/lib/dates";
import { Decimal } from "decimal.js";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;
    const { id } = await ctx.params;

    const expense = await db.expense.findUnique({ where: { id } });
    if (!expense) return bad("Expense not found", 404);

    const body = await readJson<{
      date?: string; category?: string; amount?: number; vendor?: string; notes?: string;
    }>(req);
    const data: Record<string, unknown> = {};
    if (body.date !== undefined) {
      const d = parseFlexibleDate(body.date);
      if (!d) return bad("Invalid date");
      data.date = d;
    }
    if (body.category !== undefined) data.category = String(body.category);
    if (body.amount !== undefined) {
      const n = Number(body.amount);
      if (!isFinite(n) || n <= 0) return bad("Amount must be positive");
      data.amount = new Decimal(n);
    }
    if (body.vendor !== undefined) data.vendor = body.vendor?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

    const updated = await db.expense.update({ where: { id }, data });
    await audit(user.id, "UPDATED", "Expense", id, body);
    return ok({ expense: { ...updated, amount: Number(updated.amount) } });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;
    const { id } = await ctx.params;

    const expense = await db.expense.findUnique({ where: { id } });
    if (!expense) return bad("Expense not found", 404);
    await db.expense.delete({ where: { id } });
    await audit(user.id, "DELETED", "Expense", id, { amount: Number(expense.amount), category: expense.category });
    return ok({ success: true });
  });
}
