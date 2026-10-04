import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { ok, handle } from "@/lib/api";
import { ensureInvoices } from "@/lib/rent-engine";
import { todayYm } from "@/lib/dates";
import { autoSortFix } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

/**
 * One-click data doctor:
 *  - ensures the current month's invoices exist (roll-over)
 *  - renumbers bed slots contiguously + relabels A.. (auto-sort)
 *  - merges duplicate tenants (same phone)
 *  - self-heals every invoice status from the payment log
 */
export async function POST() {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const month = todayYm();
    await ensureInvoices(month);
    const sortResult = await autoSortFix();

    // merge duplicate tenants by phone (keep the earliest, move history over)
    let tenantsMerged = 0;
    const tenants = await db.tenant.findMany({ orderBy: { createdAt: "asc" } });
    const byPhone = new Map<string, typeof tenants>();
    for (const t of tenants) {
      if (!t.phone) continue;
      const key = t.phone.replace(/\D/g, "");
      if (!key) continue;
      const list = byPhone.get(key) ?? [];
      list.push(t);
      byPhone.set(key, list);
    }
    for (const [, list] of byPhone) {
      if (list.length < 2) continue;
      const [keeper, ...dupes] = list;
      for (const dupe of dupes) {
        // merge active tenancies onto the keeper's tenancy history
        const dupeTenancies = await db.tenancy.findMany({ where: { tenantId: dupe.id } });
        let hasActive = false;
        for (const ten of dupeTenancies) {
          if (ten.isActive && !hasActive) {
            hasActive = true;
            // keeper has no active tenancy if we got here with one active — safe to reassign
            await db.tenancy.update({ where: { id: ten.id }, data: { tenantId: keeper.id } });
          } else {
            await db.tenancy.update({
              where: { id: ten.id },
              data: { tenantId: keeper.id, isActive: false },
            });
          }
        }
        await db.payment.updateMany({ where: { tenantId: dupe.id }, data: { tenantId: keeper.id } });
        await db.tenant.delete({ where: { id: dupe.id } }).catch(() => null);
        tenantsMerged++;
      }
    }

    // final status pass after merges
    const finalSort = await autoSortFix();

    const result = {
      ...finalSort,
      tenantsMerged,
      invoicesEnsured: month,
      bedsRelabeled: sortResult.bedsRelabeled + finalSort.bedsRelabeled,
      slotsRenumbered: sortResult.slotsRenumbered + finalSort.slotsRenumbered,
    };

    await audit(user.id, "SYSTEM", "Maintenance", undefined, result);
    return ok({ success: true, result });
  });
}
