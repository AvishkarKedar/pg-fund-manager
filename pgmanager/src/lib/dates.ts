/**
 * Date helpers — all "today" logic runs in Asia/Kolkata (IST) so the app
 * matches the Indian property context and never shifts a day at UTC midnight.
 * The legacy app had two conflicting today() definitions (UTC vs local) that
 * produced wrong months before 05:30 IST; this module is the single source.
 */

export const IST = "Asia/Kolkata";

export function todayIST(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${parts}T00:00:00`);
}

/** "YYYY-MM" for a date (in IST). */
export function ym(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
  }).format(d);
  return p;
}

export function todayYm(): string {
  return ym(new Date());
}

export function currentDayOfMonth(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: IST, day: "numeric" }).format(new Date())
  );
}

export function parsePeriod(period: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`Invalid period: ${period}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function addMonths(period: string, delta: number): string {
  const { year, month } = parsePeriod(period);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodLabel(period: string): string {
  const { year, month } = parsePeriod(period);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function periodLabelLong(period: string): string {
  const { year, month } = parsePeriod(period);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** First day of the period as a UTC date. */
export function periodStart(period: string): Date {
  const { year, month } = parsePeriod(period);
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Due date for a period given a due day (clamped into the month). */
export function dueDateFor(period: string, dueDay: number): Date {
  const { year, month } = parsePeriod(period);
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Math.max(dueDay, 1), dim);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Last N periods ending at `end` (inclusive), oldest first. */
export function lastNPeriods(end: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addMonths(end, -i));
  return out;
}

/**
 * Overdue rule (single definition — the legacy app hard-coded "day 10" twice):
 * an invoice is overdue when unpaid/partial and today (IST) is past the due
 * date plus a configurable grace window.
 */
export function isPastDue(period: string, dueDay: number, graceDays = 5, today = todayIST()): boolean {
  const due = dueDateFor(period, dueDay);
  due.setUTCDate(due.getUTCDate() + graceDays);
  return today.getTime() > due.getTime();
}

/** Format for <input type="date">. */
export function toDateInput(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Parse a user-supplied date string ("YYYY-MM-DD" or "DD/MM/YYYY" or "DD-MM-YYYY"). */
export function parseFlexibleDate(input: string): Date | null {
  const s = String(input ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s); // day-first (Indian convention)
  if (m) {
    const day = +m[1];
    const month = +m[2];
    if (month <= 12) return new Date(Date.UTC(+m[3], month - 1, day));
    return new Date(Date.UTC(+m[3], day - 1, month)); // month-first fallback
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
