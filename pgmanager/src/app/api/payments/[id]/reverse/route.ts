import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { reversePayment, recomputeInvoice } from "@/lib/rent-engine";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;
    const { id } = await ctx.params;

    const existing = await db.payment.findUnique({ where: { id } });
    if (!existing) return bad("Payment not found", 404);
    if (existing.reversedAt) return bad("Payment already reversed", 409);

    const reversed = await reversePayment(id);
    const invoice = existing.rentInvoiceId ? await recomputeInvoice(existing.rentInvoiceId) : null;
    await audit(user.id, "REVERSED", "Payment", id, { amount: Number(existing.amount) });

    return ok({
      success: true,
      payment: reversed ? { id: reversed.id, reversedAt: reversed.reversedAt } : null,
      invoice,
    });
  });
}
