import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { recordPayment } from "@/lib/rent-engine";
import { dueDateFor } from "@/lib/dates";
import { Decimal } from "decimal.js";

export const dynamic = "force-dynamic";

/**
 * Backfill: mark past months as fully paid for a tenancy — creates the
 * invoice (if missing) plus a payment record for each period.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const body = await readJson<{
      tenancyId?: string; periods?: string[]; method?: string; note?: string;
    }>(req);

    const tenancyId = String(body.tenancyId ?? "");
    const periods = Array.isArray(body.periods) ? body.periods.filter((p) => /^\d{4}-\d{2}$/.test(p)) : [];
    if (!tenancyId || periods.length === 0) return bad("tenancyId and periods[] are required");
    if (periods.length > 36) return bad("At most 36 months at a time");

    const tenancy = await db.tenancy.findUnique({
      where: { id: tenancyId },
      include: { tenant: true },
    });
    if (!tenancy) return bad("Tenancy not found", 404);

    const method = ["UPI", "CASH", "BANK", "CARD", "CHEQUE"].includes(String(body.method))
      ? String(body.method)
      : "CASH";

    const created: { period: string; receiptNumber: string }[] = [];
    for (const period of periods) {
      const invoice = await db.rentInvoice.upsert({
        where: { tenancyId_period: { tenancyId, period } },
        create: {
          tenancyId,
          period,
          dueAmount: tenancy.monthlyRent,
          paidAmount: new Decimal(0),
          status: "DUE",
          dueDate: dueDateFor(period, tenancy.dueDay),
        },
        update: {},
      });
      const outstanding = Number(invoice.dueAmount) - Number(invoice.paidAmount);
      if (outstanding <= 0) continue; // already settled
      const payment = await recordPayment({
        tenantId: tenancy.tenantId,
        rentInvoiceId: invoice.id,
        amount: outstanding,
        date: dueDateFor(period, tenancy.dueDay),
        method,
        notes: body.note?.trim() || "Backfilled payment history",
        recordedById: user.id,
      });
      created.push({ period, receiptNumber: payment.receiptNumber });
    }

    await audit(user.id, "PAYMENT", "Tenancy", tenancyId, {
      tenant: tenancy.tenant.name,
      backfilled: created.length,
      periods: created.map((c) => c.period),
    });

    return ok({ success: true, created }, { status: 201 });
  });
}
