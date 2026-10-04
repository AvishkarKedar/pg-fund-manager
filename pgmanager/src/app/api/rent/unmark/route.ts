import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { reversePayment, recomputeInvoice } from "@/lib/rent-engine";

export const dynamic = "force-dynamic";

/** Undo a rent payment (soft reverse — money history is never deleted). */
export async function POST(req: Request) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const { paymentId } = await readJson<{ paymentId?: string }>(req);
    const id = String(paymentId ?? "");
    if (!id) return bad("paymentId is required");

    const existing = await db.payment.findUnique({ where: { id } });
    if (!existing) return bad("Payment not found", 404);
    if (existing.reversedAt) return bad("Payment is already reversed", 409);

    const reversed = await reversePayment(id);
    const invoice = existing.rentInvoiceId ? await recomputeInvoice(existing.rentInvoiceId) : null;

    await audit(user.id, "REVERSED", "Payment", id, {
      amount: Number(existing.amount),
      receipt: existing.receiptNumber,
    });

    return ok({
      success: true,
      payment: reversed
        ? { id: reversed.id, reversedAt: reversed.reversedAt, amount: Number(reversed.amount) }
        : null,
      invoice: invoice
        ? {
            id: invoice.id,
            status: invoice.status,
            paid: Number(invoice.paidAmount),
            due: Number(invoice.dueAmount),
            outstanding: Math.max(0, Number(invoice.dueAmount) - Number(invoice.paidAmount)),
          }
        : null,
    });
  });
}
