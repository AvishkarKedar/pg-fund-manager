/* Client-side types for the PG Fund Manager API + formatting helpers. */

// ---------- shared ----------
export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface PropertySettings {
  name?: string;
  address?: string;
  ownerName?: string;
  phone?: string;
  upiId?: string;
}

export interface Preferences {
  defaultDueDay?: number;
  graceDays?: number;
  bedLabels?: string;
}

export interface RateCardItem {
  id: string;
  label: string;
  amount: number;
  note?: string;
}

export interface HouseRules {
  visiting?: string;
  quiet?: string;
  guests?: string;
  lockout?: string;
  other?: string;
}

export interface Settings {
  property?: PropertySettings | null;
  preferences?: Preferences | null;
  rateCard?: RateCardItem[] | null;
  rules?: HouseRules | null;
  /** Monthly spend caps per expense category, e.g. { FOOD: 40000 } */
  expenseBudgets?: Record<string, number> | null;
  /** Custom WhatsApp rent-reminder message template. */
  reminderTemplate?: string | null;
}

export interface MeResponse {
  user: User | null;
  settings: Settings;
}

/** GET /api/settings — the full (whitelisted) settings map. */
export interface SettingsResponse {
  settings: Settings;
}

// ---------- dashboard ----------
export interface DashboardStats {
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  occupancyRate: number;
  activeTenants: number;
  expectedRent: number;
  collected: number;
  pending: number;
  overdueCount: number;
  overdueAmount: number;
  expensesThisMonth: number;
  netIncome: number;
}

export interface SeriesPoint {
  period: string;
  label: string;
  expected?: number;
  collected: number;
  expenses?: number;
}

export interface OccupancyFloor {
  floor: number;
  total: number;
  occupied: number;
}

export interface Debtor {
  tenantId: string;
  name: string;
  room: string;
  bed: string;
  outstanding: number;
  phone: string | null;
  status: string;
}

export interface DashboardResponse {
  month: string;
  monthLabel: string;
  isCurrentMonth: boolean;
  stats: DashboardStats;
  rentStatus: Record<string, number>;
  monthlySeries: SeriesPoint[];
  occupancyByFloor: OccupancyFloor[];
  debtors: Debtor[];
  expenseBreakdown: { category: string; amount: number }[];
  methodSplit: { method: string; amount: number; count: number }[];
  recentActivity: { id: string; type: string; text: string; amount: number; at: string }[];
}

export interface InsightsResponse {
  insights: { insights: string[]; recommendation: string };
  source: "ai" | "local";
}

// ---------- rooms ----------
export interface BedTile {
  id: string;
  label: string;
  slot: number;
  status: "VACANT" | "OCCUPIED" | "NOTICE";
  tenant: {
    id: string;
    name: string;
    phone: string | null;
    status: string;
    monthlyRent: number;
    dueDay: number;
    tenancyId: string;
    startDate: string;
  } | null;
}

export interface RoomCard {
  id: string;
  number: string;
  floor: number;
  roomType: "SHARED" | "PRIVATE";
  defaultRent: number;
  notes: string | null;
  occupiedCount: number;
  beds: BedTile[];
}

export interface RoomsResponse {
  rooms: RoomCard[];
}

// ---------- tenants ----------
export interface TenantRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  workplace: string | null;
  room: string | null;
  bed: string | null;
  bedId: string | null;
  monthlyRent: number | null;
  dueDay: number | null;
  deposit: number | null;
  joined: string | null;
  tenancyId: string | null;
  current: {
    invoiceId: string;
    period: string;
    due: number;
    paid: number;
    outstanding: number;
    status: string;
  } | null;
}

export interface TenantsResponse {
  tenants: TenantRow[];
  month: string;
}

export interface TenantDetail {
  tenant: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    idType: string | null;
    idNumber: string | null;
    emergencyContact: string | null;
    workplace: string | null;
    notes: string | null;
    status: string;
    createdAt: string;
  };
  currentTenancy: {
    id: string;
    room: string;
    bed: string;
    bedId: string;
    monthlyRent: number;
    securityDeposit: number;
    dueDay: number;
    startDate: string;
    noticeDate: string | null;
  } | null;
  tenancies: {
    id: string;
    room: string;
    bed: string;
    startDate: string;
    endDate: string | null;
    monthlyRent: number;
    isActive: boolean;
  }[];
  invoices: {
    id: string;
    period: string;
    due: number;
    paid: number;
    status: string;
    dueDate: string;
    method: string | null;
    reference: string | null;
  }[];
  payments: {
    id: string;
    amount: number;
    date: string;
    method: string;
    reference: string | null;
    receiptNumber: string;
    notes: string | null;
    reversedAt: string | null;
  }[];
  outstanding: number;
  totalPaid: number;
  /** Payment reliability for the current tenancy (on-time = PAID by the due date). */
  reliability: {
    streak: number;
    onTimeCount: number;
    totalCount: number;
    onTimeRate: number | null;
  };
}

// ---------- rent ----------
export interface RentRow {
  invoiceId: string;
  tenancyId: string;
  tenantId: string;
  name: string;
  phone: string | null;
  status: string;
  room: string;
  bed: string;
  rent: number;
  dueDay: number;
  due: number;
  paid: number;
  outstanding: number;
  invoiceStatus: string;
  dueDate: string;
  method: string | null;
  reference: string | null;
  paidOn: string | null;
}

export interface RentResponse {
  month: string;
  label: string;
  prevMonth: string;
  nextMonth: string;
  isCurrent: boolean;
  totals: {
    expected: number;
    collected: number;
    pending: number;
    counts: Record<string, number>;
    activeTenancies: number;
  };
  history: { period: string; label: string; expected: number; collected: number }[];
  rows: RentRow[];
}

// ---------- payments ----------
export interface PaymentRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantPhone: string | null;
  period: string | null;
  amount: number;
  date: string;
  method: string;
  reference: string | null;
  receiptNumber: string;
  notes: string | null;
  reversedAt: string | null;
}

export interface PaymentsResponse {
  payments: PaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  pageSum: number;
}

// ---------- expenses ----------
export interface ExpenseRow {
  id: string;
  date: string;
  category: string;
  amount: number;
  vendor: string | null;
  notes: string | null;
}

export interface ExpensesResponse {
  expenses: ExpenseRow[];
  summary: {
    total: number;
    count: number;
    byCategory: { category: string; amount: number }[];
  };
  trend: { period: string; label: string; amount: number }[];
  categories: string[];
}

// ---------- issues ----------
export interface ComplaintRow {
  id: string;
  title: string;
  roomLabel: string | null;
  category: string;
  priority: string;
  status: string;
  cost: number | null;
  notes: string | null;
  date: string;
  resolvedAt: string | null;
}

export interface ComplaintsResponse {
  complaints: ComplaintRow[];
  counts: { OPEN: number; IN_PROGRESS: number; RESOLVED: number };
  categories: string[];
}

// ---------- import ----------
export interface NormalizedRow {
  index: number;
  room: string | null;
  bed: string | null;
  name: string | null;
  phone: string | null;
  rent: number | null;
  joined: string | null;
  deposit: number | null;
  dueDay: number | null;
  email: string | null;
  workplace: string | null;
  idNumber: string | null;
  status: "ACTIVE" | "NOTICE" | null;
  notes: string | null;
  monthsPaid: string[];
  warnings: string[];
}

export interface ImportParseResponse {
  file: { name: string; size: number; sheet: string; sheets: string[] };
  headerRowIndex: number;
  headers: string[];
  suggestedMapping: Record<string, number>;
  monthColumns: { index: number; period: string }[];
  detectedKind: string;
  stats: {
    totalRows: number;
    tenantRows: number;
    roomOnlyRows: number;
    withWarnings: number;
  };
  preview: NormalizedRow[];
  dataRows: string[][];
}

export interface ImportApplyResponse {
  success: true;
  summary: {
    roomsCreated: number;
    bedsCreated: number;
    tenantsCreated: number;
    tenantsMerged: number;
    paymentsCreated: number;
    invoicesCreated: number;
    rowsSkipped: number;
  };
  warnings: string[];
  sortResult: { bedsRelabeled: number; slotsRenumbered: number; invoicesRefreshed: number };
}

// ---------- reports ----------
export interface ReportsResponse {
  month: string;
  label: string;
  collections: {
    expected: number;
    collected: number;
    pending: number;
    collectionRate: number;
    paid: number;
    partial: number;
    due: number;
    overdue: number;
  };
  expenses: { total: number; byCategory: { category: string; amount: number }[] };
  profit: number;
  yearSeries: { period: string; label: string; collected: number; expenses: number; profit: number }[];
  aging: Record<string, number>;
  debtors: { name: string; room: string; period: string; outstanding: number; status: string }[];
  methodSplit: { method: string; amount: number; count: number }[];
  /** Security deposits held for every active tenancy (oldest first). */
  deposits: {
    name: string;
    phone: string | null;
    room: string;
    deposit: number;
    startDate: string;
    months: number;
  }[];
  depositsTotal: number;
}

// ---------- maintenance ----------
export interface MaintenanceResult {
  success: true;
  result: {
    bedsRelabeled: number;
    slotsRenumbered: number;
    invoicesRefreshed: number;
    tenantsMerged: number;
    invoicesEnsured: string;
  };
}

// ---------- formatting helpers ----------
const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrCompactFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function fmtINR(n: number | null | undefined, compact = false): string {
  const v = Number(n);
  if (n === null || n === undefined || !isFinite(v)) return "—";
  return (compact ? inrCompactFmt : inrFmt).format(v);
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return dateFmt.format(d);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "—";
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  const days = Math.floor(secs / 86400);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ---------- month helpers (IST) ----------
function istNow(): Date {
  const s = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  return new Date(s);
}

export function todayYm(): string {
  const d = istNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function todayIsoDate(): string {
  const d = istNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addMonthsYm(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(period: string, long = false): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return `${(long ? MONTHS_LONG : MONTHS_SHORT)[m - 1]} ${y}`;
}

export function monthLabelShort(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`;
}

export function lastNMonths(n: number, from = todayYm()): string[] {
  return Array.from({ length: n }, (_, i) => addMonthsYm(from, i - (n - 1)));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function waLink(phone: string | null | undefined, message: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

export function telLink(phone: string | null | undefined): string {
  return `tel:${(phone ?? "").replace(/[^\d+]/g, "")}`;
}

export const DEFAULT_REMINDER_TEMPLATE =
  "Hi {name}! Gentle reminder — rent of {amount} for {month} (Room {room}-{bed}) at {property} is pending. Kindly pay at the earliest. Thank you!";

/** Replace {placeholders} in a reminder template; unknown vars become empty. */
export function renderReminderTemplate(
  template: string | null | undefined,
  vars: Record<string, string | number | null | undefined>
): string {
  const tpl = template?.trim() ? template : DEFAULT_REMINDER_TEMPLATE;
  return tpl.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = vars[key];
    return v === null || v === undefined || v === "" ? "" : String(v);
  });
}

export const RENT_REMINDER = (name: string, amount: number, month: string) =>
  `Hi ${name.split(" ")[0]}, gentle reminder — rent of ${fmtINR(amount)} for ${monthLabel(month)} is pending at Sunrise PG. Please pay via UPI. Thank you!`;

// natural sort key for room numbers: "9" < "10" < "101"
export function roomNaturalKey(number: string): (number | string)[] {
  const m = /^(\d+)(.*)$/.exec((number ?? "").trim());
  if (!m) return [Number.MAX_SAFE_INTEGER, number];
  return [Number(m[1]), m[2] ?? ""];
}
