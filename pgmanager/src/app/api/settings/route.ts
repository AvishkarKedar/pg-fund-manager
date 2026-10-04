import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

const KEYS = ["property", "preferences", "rateCard", "rules"] as const;

export async function GET() {
  return handle(async () => {
    const { response } = await requireAuth();
    if (response) return response;

    const rows = await db.setting.findMany({ where: { key: { in: [...KEYS] } } });
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = null;
      }
    }
    return ok({ settings });
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const body = await readJson<Record<string, unknown>>(req);
    // strict whitelist — the legacy app let imports wipe these settings
    const applied: string[] = [];
    for (const key of KEYS) {
      if (body[key] !== undefined) {
        await db.setting.upsert({
          where: { key },
          create: { key, value: JSON.stringify(body[key]) },
          update: { value: JSON.stringify(body[key]) },
        });
        applied.push(key);
      }
    }
    await audit(user.id, "UPDATED", "Settings", undefined, { applied });

    const rows = await db.setting.findMany({ where: { key: { in: [...KEYS] } } });
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = null;
      }
    }
    return ok({ settings, applied });
  });
}
