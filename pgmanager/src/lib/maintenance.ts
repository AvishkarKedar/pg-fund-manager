import { db } from "@/lib/db";
import { Decimal } from "decimal.js";

/** Natural sort key for room numbers: "9" < "10" < "101". */
export function roomSortKey(number: string): (number | string)[] {
  const m = /^(\d+)(.*)$/.exec(number.trim());
  if (!m) return [Number.MAX_SAFE_INTEGER, number];
  return [Number(m[1]), m[2] ?? ""];
}

/**
 * Auto-sort & fix (data doctor):
 *  - renumbers bed slots contiguously 1..N and relabels A, B, C…
 *  - self-heals every invoice status from the append-only payment log
 */
export async function autoSortFix(): Promise<{
  bedsRelabeled: number;
  slotsRenumbered: number;
  invoicesRefreshed: number;
}> {
  const result = { bedsRelabeled: 0, slotsRenumbered: 0, invoicesRefreshed: 0 };

  const rooms = await db.room.findMany({
    include: { beds: { orderBy: { slot: "asc" } } },
  });
  for (const room of rooms) {
    for (let i = 0; i < room.beds.length; i++) {
      const bed = room.beds[i];
      const slot = i + 1;
      const label = String.fromCharCode(64 + slot);
      if (bed.slot !== slot || bed.label !== label) {
        await db.bed.update({ where: { id: bed.id }, data: { slot, label } });
        if (bed.slot !== slot) result.slotsRenumbered++;
        else result.bedsRelabeled++;
      }
    }
  }

  const invoices = await db.rentInvoice.findMany({
    include: {
      tenancy: { select: { dueDay: true } },
      payments: { where: { reversedAt: null }, orderBy: { date: "asc" } },
    },
  });
  const now = new Date();
  for (const inv of invoices) {
    const paid = inv.payments.reduce((s, p) => s + p.amount.toNumber(), 0);
    const due = inv.dueAmount.toNumber();
    let status = "DUE";
    if (inv.status === "WAIVED") status = "WAIVED";
    else if (paid >= due && due > 0) status = "PAID";
    else if (paid > 0) status = "PARTIAL";
    else {
      const [y, m] = inv.period.split("-").map(Number);
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const graceEnd = new Date(Date.UTC(y, m - 1, Math.min(inv.tenancy.dueDay, dim) + 5));
      status = now.getTime() > graceEnd.getTime() ? "OVERDUE" : "DUE";
    }
    const last = inv.payments[inv.payments.length - 1];
    if (inv.status !== status || Number(inv.paidAmount) !== paid) {
      await db.rentInvoice.update({
        where: { id: inv.id },
        data: {
          status,
          paidAmount: new Decimal(paid),
          paidOn: status === "PAID" ? (last?.date ?? inv.paidOn) : inv.paidOn,
          method: last?.method ?? inv.method,
          reference: last?.reference ?? inv.reference,
        },
      });
      result.invoicesRefreshed++;
    }
  }
  return result;
}
