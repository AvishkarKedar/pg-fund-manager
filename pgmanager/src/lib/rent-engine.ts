import { db } from "@/lib/db";
import { Decimal } from "decimal.js";
import {
  todayIST,
  todayYm,
  periodStart,
  dueDateFor,
  isPastDue,
  parsePeriod,
} from "@/lib/dates";

export type InvoiceStatus = "PAID" | "PARTIAL" | "DUE" | "OVERDUE" | "WAIVED";

/**
 * Auto roll-over: make sure every ACTIVE tenancy has an invoice row for the
 * given period. Safe to call on every rent-roll read — the legacy app only
 * reset paid flags on page reload, so a tab left open over a month boundary
 * showed stale rent state. This eliminates that class of bug.
 */
export async function ensureInvoices(period: string) {
  const activeTenancies = await db.tenancy.findMany({
    where: { isActive: true },
    select: { id: true, monthlyRent: true, dueDay: true, startDate: true },
  });
  const start = periodStart(period).getTime();
  const relevant = activeTenancies.filter((t) => t.startDate.getTime() <= start + 31 * 86400000);
  for (const t of relevant) {
    await db.rentInvoice.upsert({
      where: { tenancyId_period: { tenancyId: t.id, period } },
      create: {
        tenancyId: t.id,
        period,
        dueAmount: t.monthlyRent,
        paidAmount: new Decimal(0),
        status: "DUE",
        dueDate: dueDateFor(period, t.dueDay),
      },
      update: {}, // never clobber existing amounts
    });
  }
}

/** Recompute paidAmount + status from the append-only payment log. */
export async function recomputeInvoice(invoiceId: string) {
  const invoice = await db.rentInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      tenancy: { select: { dueDay: true } },
      payments: { where: { reversedAt: null }, orderBy: { date: "asc" } },
    },
  });
  if (!invoice) return null;
  const paid = invoice.payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
  const last = invoice.payments[invoice.payments.length - 1];
  let status: InvoiceStatus;
  if (invoice.status === "WAIVED") {
    status = "WAIVED";
  } else if (paid.gte(invoice.dueAmount) && invoice.dueAmount.gt(0)) {
    status = "PAID";
  } else if (paid.gt(0)) {
    status = "PARTIAL";
  } else if (isPastDue(invoice.period, invoice.tenancy.dueDay)) {
    status = "OVERDUE";
  } else {
    status = "DUE";
  }
  return db.rentInvoice.update({
    where: { id: invoiceId },
    data: {
      paidAmount: paid,
      status,
      paidOn: status === "PAID" ? (last?.date ?? invoice.paidOn) : invoice.paidOn,
      method: last?.method ?? invoice.method,
      reference: last?.reference ?? invoice.reference,
    },
  });
}

/** Refresh statuses (DUE<->OVERDUE) for all invoices of a period. */
export async function refreshStatuses(period: string) {
  const invoices = await db.rentInvoice.findMany({
    where: { period },
    include: { tenancy: { select: { dueDay: true } } },
  });
  for (const inv of invoices) {
    if (inv.status === "PAID" || inv.status === "WAIVED") continue;
    const overdue = isPastDue(inv.period, inv.tenancy.dueDay);
    const next = overdue ? "OVERDUE" : "DUE";
    if (inv.status !== next && inv.paidAmount.gt(0)) {
      // partial: keep PARTIAL label but it is also late — surfaced in UI
      continue;
    }
    if (inv.status !== next) {
      await db.rentInvoice.update({ where: { id: inv.id }, data: { status: next } });
    }
  }
}

/**
 * Deterministic receipt number: RCP-YYYYMM-####, suffix = 1 + max existing
 * suffix for the prefix. Uses a transaction so concurrent writes can't collide
 * (legacy used Math.random() — same payment could get different numbers).
 */
export async function nextReceiptNumber(tx: typeof db, date: Date): Promise<string> {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `RCP-${y}${m}-`;
  const rows = await tx.payment.findMany({
    where: { receiptNumber: { startsWith: prefix } },
    select: { receiptNumber: true },
  });
  let max = 0;
  for (const r of rows) {
    const n = Number(r.receiptNumber.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export interface RecordPaymentInput {
  tenantId: string;
  rentInvoiceId?: string | null;
  amount: number;
  date: Date;
  method: string;
  reference?: string | null;
  notes?: string | null;
  recordedById?: string | null;
}

/** Transactional payment creation: payment + invoice recompute, all-or-nothing. */
export async function recordPayment(input: RecordPaymentInput) {
  return db.$transaction(async (tx) => {
    const receiptNumber = await nextReceiptNumber(tx, input.date);
    const payment = await tx.payment.create({
      data: {
        tenantId: input.tenantId,
        rentInvoiceId: input.rentInvoiceId ?? null,
        amount: new Decimal(input.amount),
        date: input.date,
        method: input.method,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        receiptNumber,
        recordedById: input.recordedById ?? null,
      },
    });
    if (input.rentInvoiceId) {
      await recomputeInvoiceTx(tx, input.rentInvoiceId);
    }
    return payment;
  });
}

/** Soft-reverse a payment and recompute its invoice — money history is never deleted. */
export async function reversePayment(paymentId: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.reversedAt) return null;
  await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: paymentId }, data: { reversedAt: new Date() } });
    if (payment.rentInvoiceId) {
      await recomputeInvoiceTx(tx, payment.rentInvoiceId);
    }
  });
  return db.payment.findUnique({ where: { id: paymentId } });
}

async function recomputeInvoiceTx(tx: typeof db, invoiceId: string) {
  const invoice = await tx.rentInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      tenancy: { select: { dueDay: true } },
      payments: { where: { reversedAt: null }, orderBy: { date: "asc" } },
    },
  });
  if (!invoice) return;
  const paid = invoice.payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
  const last = invoice.payments[invoice.payments.length - 1];
  let status: InvoiceStatus;
  if (invoice.status === "WAIVED") {
    status = "WAIVED";
  } else if (paid.gte(invoice.dueAmount) && invoice.dueAmount.gt(0)) {
    status = "PAID";
  } else if (paid.gt(0)) {
    status = "PARTIAL";
  } else if (isPastDue(invoice.period, invoice.tenancy.dueDay)) {
    status = "OVERDUE";
  } else {
    status = "DUE";
  }
  await tx.rentInvoice.update({
    where: { id: invoiceId },
    data: {
      paidAmount: paid,
      status,
      paidOn: status === "PAID" ? (last?.date ?? null) : invoice.paidOn,
      method: last?.method ?? null,
      reference: last?.reference ?? null,
    },
  });
}

/** Check-out a tenancy: closes it, frees the bed, keeps all history intact. */
export async function checkoutTenancy(tenancyId: string, endDate: Date) {
  return db.$transaction(async (tx) => {
    const tenancy = await tx.tenancy.findUnique({
      where: { id: tenancyId },
      include: { tenant: true },
    });
    if (!tenancy || !tenancy.isActive) throw new Error("Tenancy already closed");
    await tx.tenancy.update({
      where: { id: tenancyId },
      data: { isActive: false, endDate },
    });
    await tx.tenant.update({
      where: { id: tenancy.tenantId },
      data: { status: "CHECKED_OUT" },
    });
    return tenancy;
  });
}

/** Period range list for a tenancy (start..current or end), oldest first. */
export function periodsForTenancy(start: Date, end: Date | null, upTo: string): string[] {
  const startYm = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  const endYm = end
    ? `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`
    : upTo;
  const out: string[] = [];
  let cur = startYm;
  const { year, month } = parsePeriod(upTo);
  const limit = year * 12 + month;
  while (parsePeriod(cur).year * 12 + parsePeriod(cur).month <= limit) {
    out.push(cur);
    if (cur === endYm) break;
    const p = parsePeriod(cur);
    const next = new Date(Date.UTC(p.year, p.month, 1));
    cur = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    if (out.length > 60) break; // safety
  }
  return out;
}
