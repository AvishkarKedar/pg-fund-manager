import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ok, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

const SETTING_KEYS = ["property", "preferences", "rateCard", "rules"] as const;

export async function GET() {
  return handle(async () => {
    const user = await getSessionUser();
    const settingsRows = await db.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } });
    const settings: Record<string, unknown> = {};
    for (const row of settingsRows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = null;
      }
    }
    return ok({
      user: user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null,
      settings,
    });
  });
}
