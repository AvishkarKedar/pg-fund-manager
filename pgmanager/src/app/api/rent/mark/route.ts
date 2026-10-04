import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { recordPayment, recomputeInvoice } from "@/lib/rent-engine";
import { parseFlexibleDate, todayIST } from "@/lib/dates";

export const dynamic = "force-dynamic";

const METHODS = new Set(["UPI", "CASH", "BANK", "CARD", "CHEQUE"]);

export async function POST(req: Request) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const body = await readJson<{
      invoiceId?: string; amount?: number; method?: string;
      reference?: string; date?: string; notes?: string;
    }>(req);

    const invoiceId = String(body.invoiceId ?? "");
    if (!invoiceId) return bad("invoiceId is required");

    const invoice = await db.rentInvoice.findUnique({
      where: { id: invoiceId },
      include: { tenancy: { include: { tenant: true, bed: { include: { room: true } } } } },
    });
    if (!invoice) return bad("Invoice not found", 404);

    const outstanding = Math.max(0, Number(invoice.dueAmount) - Number(invoice.paidAmount));
    let amount = Number(body.amount ?? outstanding);
    if (!isFinite(amount) || amount <= 0) return bad("Amount must be greater than zero");
    if (amount > outstanding) {
      return bad(
        `Amount exceeds outstanding balance of ₹${outstanding.toLocaleString("en-IN")}. Record the extra as an advance payment from the Payments tab.`,
        422,
        { outstanding }
      );
    }

    const method = METHODS.has(String(body.method)) ? String(body.method) : "UPI";
    const date = body.date ? parseFlexibleDate(body.date) : todayIST();
    if (!date) return bad("Invalid payment date");

    const payment = await recordPayment({
      tenantId: invoice.tenancy.tenantId,
      rentInvoiceId: invoice.id,
      amount,
      date,
      method,
      reference: body.reference?.trim() || null,
      notes: body.notes?.trim() || null,
      recordedById: user.id,
    });

    const updated = await recomputeInvoice(invoice.id);
    await audit(user.id, "PAYMENT", "Payment", payment.id, {
      tenant: invoice.tenancy.tenant.name,
      month: invoice.period,
      amount,
      method,
      receipt: payment.receiptNumber,
    });

    return ok(
      {
        payment: {
          id: payment.id,
          amount: Number(payment.amount),
          receiptNumber: payment.receiptNumber,
          date: payment.date,
          method: payment.method,
        },
        invoice: updated
          ? {
              id: updated.id,
              status: updated.status,
              paid: Number(updated.paidAmount),
              due: Number(updated.dueAmount),
              outstanding: Math.max(0, Number(updated.dueAmount) - Number(updated.paidAmount)),
            }
          : null,
      },
      { status: 201 }
    );
  });
}
