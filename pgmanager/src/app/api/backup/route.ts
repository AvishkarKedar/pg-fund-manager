import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { ok, bad, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Everything a full backup contains (User/Session/AuditLog are intentionally excluded). */
const DATA_KEYS = [
  "rooms", "beds", "tenants", "tenancies", "rentInvoices",
  "payments", "expenses", "complaints", "settings",
] as const;

/** Settings keys mirrored from the /api/settings whitelist. */
const SETTING_KEYS = ["property", "preferences", "rateCard", "rules", "expenseBudgets", "reminderTemplate"] as const;

type PlainRow = Record<string, unknown>;

/** Prisma row → plain JSON: DateTime → ISO string, Decimal → number. */
function toPlain(row: object): PlainRow {
  const out: PlainRow = {};
  for (const [key, val] of Object.entries(row)) {
    if (val instanceof Date) out[key] = val.toISOString();
    else if (val instanceof Prisma.Decimal) out[key] = val.toNumber();
    else out[key] = val;
  }
  return out;
}

/** yyyyMMdd-HHmm filename stamp (local time). */
function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function GET() {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const [rooms, beds, tenants, tenancies, rentInvoices, payments, expenses, complaints, settingRows] =
      await Promise.all([
        db.room.findMany(),
        db.bed.findMany(),
        db.tenant.findMany(),
        db.tenancy.findMany(),
        db.rentInvoice.findMany(),
        db.payment.findMany(),
        db.expense.findMany(),
        db.complaint.findMany(),
        db.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } }),
      ]);

    const data = {
      rooms: rooms.map((r) => toPlain(r)),
      beds: beds.map((r) => toPlain(r)),
      tenants: tenants.map((r) => toPlain(r)),
      tenancies: tenancies.map((r) => toPlain(r)),
      rentInvoices: rentInvoices.map((r) => toPlain(r)),
      payments: payments.map((r) => toPlain(r)),
      expenses: expenses.map((r) => toPlain(r)),
      complaints: complaints.map((r) => toPlain(r)),
      settings: settingRows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt.toISOString() })),
    };
    const counts = {
      rooms: data.rooms.length,
      beds: data.beds.length,
      tenants: data.tenants.length,
      tenancies: data.tenancies.length,
      rentInvoices: data.rentInvoices.length,
      payments: data.payments.length,
      expenses: data.expenses.length,
      complaints: data.complaints.length,
      settings: data.settings.length,
    };
    const payload = { version: 1, exportedAt: new Date().toISOString(), counts, data };

    await audit(user.id, "EXPORTED", "Backup", undefined, { counts });
    return NextResponse.json(payload, {
      headers: { "Content-Disposition": `attachment; filename="pg-backup-${stamp()}.json"` },
    });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    // read raw text first — readJson() would hide the payload size
    const raw = await req.text();
    if (raw.length > 5_000_000) return bad("Backup file too large (over 5 MB)");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return bad("Invalid JSON backup file");
    }

    const body = parsed as { version?: unknown; data?: unknown };
    if (body.version !== 1) return bad("Unsupported backup version — expected 1");
    const data = body.data as PlainRow | undefined;
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return bad("Malformed backup: missing data object");
    }
    for (const key of DATA_KEYS) {
      if (!Array.isArray(data[key])) return bad(`Malformed backup: data.${key} must be an array`);
    }

    const rooms = data.rooms as PlainRow[];
    const beds = data.beds as PlainRow[];
    const tenants = data.tenants as PlainRow[];
    const tenancies = data.tenancies as PlainRow[];
    const rentInvoices = data.rentInvoices as PlainRow[];
    const payments = data.payments as PlainRow[];
    const expenses = data.expenses as PlainRow[];
    const complaints = data.complaints as PlainRow[];
    const settingRows = data.settings as { key?: unknown; value?: unknown }[];

    // Whole restore is one transaction — any failure rolls back and leaves data intact.
    const restored = await db.$transaction(async (tx) => {
      // wipe children first
      await tx.payment.deleteMany();
      await tx.rentInvoice.deleteMany();
      await tx.tenancy.deleteMany();
      await tx.complaint.deleteMany();
      await tx.expense.deleteMany();
      await tx.bed.deleteMany();
      await tx.tenant.deleteMany();
      await tx.room.deleteMany();
      const settingKeys = settingRows.map((s) => String(s.key)).filter(Boolean);
      if (settingKeys.length > 0) await tx.setting.deleteMany({ where: { key: { in: settingKeys } } });

      // recreate parent-first, preserving every id
      if (rooms.length > 0) await tx.room.createMany({ data: rooms as unknown as Prisma.RoomCreateManyInput[] });
      if (beds.length > 0) await tx.bed.createMany({ data: beds as unknown as Prisma.BedCreateManyInput[] });
      if (tenants.length > 0) await tx.tenant.createMany({ data: tenants as unknown as Prisma.TenantCreateManyInput[] });
      if (tenancies.length > 0) await tx.tenancy.createMany({ data: tenancies as unknown as Prisma.TenancyCreateManyInput[] });
      if (rentInvoices.length > 0) await tx.rentInvoice.createMany({ data: rentInvoices as unknown as Prisma.RentInvoiceCreateManyInput[] });
      if (payments.length > 0) await tx.payment.createMany({ data: payments as unknown as Prisma.PaymentCreateManyInput[] });
      if (expenses.length > 0) await tx.expense.createMany({ data: expenses as unknown as Prisma.ExpenseCreateManyInput[] });
      if (complaints.length > 0) await tx.complaint.createMany({ data: complaints as unknown as Prisma.ComplaintCreateManyInput[] });
      for (const s of settingRows) {
        const key = String(s.key);
        if (!key) continue;
        const value = s.value === undefined || s.value === null ? "" : String(s.value);
        await tx.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
      }

      return {
        rooms: rooms.length,
        beds: beds.length,
        tenants: tenants.length,
        tenancies: tenancies.length,
        rentInvoices: rentInvoices.length,
        payments: payments.length,
        expenses: expenses.length,
        complaints: complaints.length,
        settings: settingRows.length,
      };
    });

    await audit(user.id, "RESTORED", "Backup", undefined, restored);
    return ok({ ok: true, restored });
  });
}
