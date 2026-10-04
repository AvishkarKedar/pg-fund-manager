import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { normalizeRows, type FieldKey } from "@/lib/import-engine";
import { Decimal } from "decimal.js";
import { dueDateFor, todayYm, parseFlexibleDate } from "@/lib/dates";
import { autoSortFix } from "@/lib/maintenance";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface ApplyBody {
  dataRows?: string[][];
  headers?: string[];
  headerRowIndex?: number;
  mapping?: Record<string, number | null>;
  monthColumns?: { index: number; period: string }[];
  mode?: "MERGE" | "REPLACE";
  defaultRent?: number;
  defaultDueDay?: number;
}

export async function POST(req: Request) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const body = await readJson<ApplyBody>(req);
    const dataRows = Array.isArray(body.dataRows) ? body.dataRows : [];
    if (dataRows.length === 0) return bad("No data rows supplied");
    if (dataRows.length > 2000) return bad("At most 2000 rows per import");

    const mode = body.mode === "REPLACE" ? "REPLACE" : "MERGE";
    const defaultRent = Number(body.defaultRent ?? 6500) || 6500;
    const defaultDueDay = Number(body.defaultDueDay ?? 5) || 5;

    const detected = {
      headerRowIndex: Number(body.headerRowIndex ?? 0),
      headers: body.headers ?? [],
      mapping: (body.mapping ?? {}) as Partial<Record<FieldKey, number>>,
      monthColumns: body.monthColumns ?? [],
    };

    const matrix = [detected.headers, ...dataRows];
    const normalized = normalizeRows(matrix, detected, detected.mapping, detected.monthColumns);

    const warnings: string[] = [];
    const summary = {
      roomsCreated: 0,
      bedsCreated: 0,
      tenantsCreated: 0,
      tenantsMerged: 0,
      paymentsCreated: 0,
      invoicesCreated: 0,
      rowsSkipped: 0,
    };

    const mergedTenantIds = new Set<string>();

    await db.$transaction(async (tx) => {
      if (mode === "REPLACE") {
        // Replace occupancy state while PRESERVING money history:
        // detach payments from invoices, drop invoices/tenancies/rooms/beds,
        // check tenants out. Payment rows survive (append-only ledger).
        // Settings, expenses and complaints are NEVER touched by imports.
        await tx.payment.updateMany({ data: { rentInvoiceId: null } });
        await tx.rentInvoice.deleteMany({});
        await tx.tenancy.deleteMany({});
        await db.complaint.updateMany({ data: { roomId: null } });
        await tx.room.deleteMany({}); // beds cascade
        await tx.tenant.updateMany({ data: { status: "CHECKED_OUT" } });
      }

      const existingRooms = await tx.room.findMany({});
      const roomByNumber = new Map(existingRooms.map((r) => [r.number.toLowerCase(), r]));
      const existingTenants = await tx.tenant.findMany({});
      const tenantByPhone = new Map(
        existingTenants.filter((t) => t.phone).map((t) => [t.phone!.replace(/\D/g, ""), t])
      );
      const tenantByName = new Map(existingTenants.map((t) => [t.name.toLowerCase().trim(), t]));

      // ---------- pass 1: ensure rooms ----------
      const roomsReferenced = [
        ...new Set(normalized.filter((r) => r.room).map((r) => r.room!.trim())),
      ];
      for (const num of roomsReferenced) {
        if (roomByNumber.has(num.toLowerCase())) continue;
        const dupe = await tx.room.findFirst({ where: { number: num } });
        if (dupe) {
          roomByNumber.set(num.toLowerCase(), dupe);
          continue;
        }
        const created = await tx.room.create({
          data: {
            number: num,
            floor: guessFloor(num),
            roomType: "SHARED",
            defaultRent: new Decimal(defaultRent),
          },
        });
        roomByNumber.set(num.toLowerCase(), created);
        summary.roomsCreated++;
      }

      // ---------- pass 2: ensure enough beds per room ----------
      const bedsNeeded = new Map<string, number>();
      for (const row of normalized) {
        if (!row.room || !row.name) continue;
        const room = roomByNumber.get(row.room.toLowerCase());
        if (!room) continue;
        const count = (bedsNeeded.get(room.id) ?? 0) + 1;
        bedsNeeded.set(room.id, count);
      }
      const bedCountByRoom = new Map<string, number>();
      for (const [roomId, needed] of bedsNeeded) {
        const beds = await tx.bed.findMany({ where: { roomId }, orderBy: { slot: "asc" } });
        bedCountByRoom.set(roomId, beds.length);
        for (let slot = beds.length + 1; slot <= Math.min(needed, 12); slot++) {
          await tx.bed.create({ data: { roomId, slot, label: String.fromCharCode(64 + slot) } });
          summary.bedsCreated++;
          bedCountByRoom.set(roomId, slot);
        }
        if (needed > 12) {
          warnings.push(`Room needs more than 12 beds — extra rows will be skipped`);
        }
      }

      // ---------- pass 3: tenants + tenancies + rent ----------
      const bedTaken = new Set<string>();
      const activeTenancies = await tx.tenancy.findMany({
        where: { isActive: true },
        select: { bedId: true },
      });
      for (const t of activeTenancies) bedTaken.add(t.bedId);

      for (const row of normalized) {
        if (!row.name) {
          summary.rowsSkipped++;
          continue;
        }

        const phoneKey = row.phone?.replace(/\D/g, "") ?? "";
        let tenant = phoneKey ? tenantByPhone.get(phoneKey) ?? null : null;
        if (!tenant) tenant = tenantByName.get(row.name.toLowerCase()) ?? null;

        if (tenant && mode === "MERGE") {
          summary.tenantsMerged++;
          mergedTenantIds.add(tenant.id);
          const patch: Record<string, unknown> = {};
          if (!tenant.phone && row.phone) patch.phone = row.phone;
          if (!tenant.email && row.email) patch.email = row.email;
          if (!tenant.workplace && row.workplace) patch.workplace = row.workplace;
          if (!tenant.idNumber && row.idNumber) patch.idNumber = row.idNumber;
          if (row.status === "NOTICE" && tenant.status === "ACTIVE") patch.status = "NOTICE";
          if (Object.keys(patch).length > 0) {
            tenant = await tx.tenant.update({ where: { id: tenant.id }, data: patch });
            if (patch.phone) tenantByPhone.set(phoneKey, tenant);
          }
        } else {
          const createdTenant = await tx.tenant.create({
            data: {
              name: row.name,
              phone: row.phone,
              email: row.email,
              idNumber: row.idNumber,
              workplace: row.workplace,
              notes: row.notes,
              status: row.status === "NOTICE" ? "NOTICE" : "ACTIVE",
            },
          });
          tenant = createdTenant;
          if (row.phone) tenantByPhone.set(phoneKey, createdTenant);
          tenantByName.set(row.name.toLowerCase(), createdTenant);
          summary.tenantsCreated++;
        }

        const currentTenancy = await tx.tenancy.findFirst({
          where: { tenantId: tenant.id, isActive: true },
        });

        if (!currentTenancy && row.room) {
          const room = roomByNumber.get(row.room.toLowerCase());
          if (!room) {
            warnings.push(`Row ${row.index}: room "${row.room}" could not be created`);
            continue;
          }
          const beds = await tx.bed.findMany({
            where: { roomId: room.id },
            orderBy: { slot: "asc" },
          });
          const freeBed = beds.find((b) => !bedTaken.has(b.id));
          if (freeBed) {
            const rent = row.rent ?? defaultRent;
            const startDate = row.joined ? (parseFlexibleDate(row.joined) ?? new Date()) : new Date();
            const tenancy = await tx.tenancy.create({
              data: {
                tenantId: tenant.id,
                bedId: freeBed.id,
                startDate,
                monthlyRent: new Decimal(rent),
                securityDeposit: new Decimal(row.deposit ?? rent),
                dueDay: row.dueDay ?? defaultDueDay,
                isActive: true,
              },
            });
            bedTaken.add(freeBed.id);
            await ensureInvoicesForImport(tx, tenancy.id, rent, row.dueDay ?? defaultDueDay, row.monthsPaid, summary);
          } else if (beds.length >= 12) {
            warnings.push(`Row ${row.index}: room ${row.room} is full — ${row.name} saved without a bed`);
          } else {
            warnings.push(`Row ${row.index}: no free bed in room ${row.room} for ${row.name}`);
          }
        } else if (currentTenancy && row.monthsPaid.length > 0) {
          await ensureInvoicesForImport(
            tx,
            currentTenancy.id,
            Number(currentTenancy.monthlyRent),
            currentTenancy.dueDay,
            row.monthsPaid,
            summary
          );
        }
      }
    });

    // ---------- pass 4: auto-sort & self-heal ----------
    const sortResult = await autoSortFix();

    await audit(user.id, "IMPORTED", "Import", undefined, {
      mode,
      ...summary,
      warnings: warnings.length,
      rows: dataRows.length,
    });

    return ok({ success: true, summary, warnings, sortResult });
  });
}

function guessFloor(roomNumber: string): number {
  const m = /^(\d)/.exec(roomNumber.trim());
  if (!m) return 1;
  const first = Number(m[1]);
  return first >= 1 && first <= 9 ? first : 1;
}

async function ensureInvoicesForImport(
  tx: typeof db,
  tenancyId: string,
  rent: number,
  dueDay: number,
  monthsPaid: string[],
  summary: { invoicesCreated: number; paymentsCreated: number }
) {
  const cur = todayYm();
  for (const period of monthsPaid) {
    if (!/^\d{4}-\d{2}$/.test(period)) continue;
    const invoice = await tx.rentInvoice.upsert({
      where: { tenancyId_period: { tenancyId, period } },
      create: {
        tenancyId,
        period,
        dueAmount: new Decimal(rent),
        paidAmount: new Decimal(0),
        status: "DUE",
        dueDate: dueDateFor(period, dueDay),
      },
      update: {},
    });
    const isCreate = invoice.createdAt.getTime() === invoice.updatedAt.getTime() && Number(invoice.paidAmount) === 0;
    if (isCreate) summary.invoicesCreated++;

    const outstanding = Number(invoice.dueAmount) - Number(invoice.paidAmount);
    if (outstanding > 0) {
      const invWithTenant = await tx.rentInvoice.findUnique({
        where: { id: invoice.id },
        select: { tenancy: { select: { tenantId: true } } },
      });
      const tenantId = invWithTenant?.tenancy.tenantId;
      if (!tenantId) continue;
      const prefix = `RCP-${period.replace("-", "")}-`;
      const existing = await tx.payment.findMany({
        where: { receiptNumber: { startsWith: prefix } },
        select: { receiptNumber: true },
      });
      let max = 0;
      for (const r of existing) {
        const n = Number(r.receiptNumber.slice(prefix.length));
        if (Number.isFinite(n) && n > max) max = n;
      }
      await tx.payment.create({
        data: {
          tenantId,
          rentInvoiceId: invoice.id,
          amount: new Decimal(outstanding),
          date: dueDateFor(period, dueDay),
          method: "UPI",
          notes: "Imported from Excel",
          receiptNumber: `${prefix}${String(max + 1).padStart(4, "0")}`,
        },
      });
      await tx.rentInvoice.update({
        where: { id: invoice.id },
        data: { paidAmount: new Decimal(rent), status: "PAID", paidOn: dueDateFor(period, dueDay), method: "UPI" },
      });
      summary.paymentsCreated++;
    }
    if (period > cur) break;
  }
}
