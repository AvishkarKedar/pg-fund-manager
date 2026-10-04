import { Decimal } from "decimal.js";

/** Format an amount as Indian Rupees: ₹12,500 / ₹12,500.50 */
export function formatINR(amount: number | Decimal | string | null | undefined, opts?: { compact?: boolean; paise?: boolean }): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = Number(amount);
  if (!isFinite(n)) return "—";
  if (opts?.compact && Math.abs(n) >= 100000) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  const fractions = opts?.paise || !Number.isInteger(n) ? 2 : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: fractions,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Compact currency for charts: ₹1.2L style. */
export function formatINRShort(n: number): string {
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/** Parse user/Excel input like "₹ 6,500.50", "6500", " 6 500 " → number, or null. */
export function parseAmount(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return isFinite(input) ? input : null;
  const s = String(input).replace(/[₹,\s]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

export function toDecimal(n: number | string | Decimal | null | undefined): Decimal {
  return new Decimal(n ?? 0);
}

export function dec(n: number | string | Decimal | null | undefined): number {
  return Number(n ?? 0);
}

/** Deterministic, collision-free receipt numbers: RCP-YYYYMM-0001 style. */
export function receiptNumberFor(seq: number, date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `RCP-${y}${m}-${String(seq).padStart(4, "0")}`;
}

export const PAYMENT_METHODS = ["UPI", "CASH", "BANK", "CARD", "CHEQUE"] as const;
export const EXPENSE_CATEGORIES = [
  "FOOD",
  "ELECTRICITY",
  "WATER",
  "MAINTENANCE",
  "SALARY",
  "INTERNET",
  "CLEANING",
  "REPAIR",
  "RENT",
  "OTHER",
] as const;
export const COMPLAINT_CATEGORIES = [
  "ELECTRICAL",
  "PLUMBING",
  "CLEANLINESS",
  "INTERNET",
  "FOOD",
  "FURNITURE",
  "OTHER",
] as const;
