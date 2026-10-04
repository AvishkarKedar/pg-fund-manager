import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Global search for the command palette (Ctrl/Cmd+K).
 * GET /api/search?q=…  → { tenants: TenantHit[], rooms: RoomHit[] }
 *
 * Note: Prisma's `mode: "insensitive"` is not available on the SQLite connector
 * (generated types exclude QueryMode), but SQLite's LIKE — which Prisma uses for
 * `contains` — is case-insensitive for ASCII by default, so matches are
 * case-insensitive in practice (all demo data is ASCII).
 */
export async function GET(req: Request) {
  return handle(async () => {
    const { response } = await requireAuth();
    if (response) return response;

    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (!q) return ok({ tenants: [], rooms: [] });

    const [tenants, rooms] = await Promise.all([
      db.tenant.findMany({
        where: {
          OR: [{ name: { contains: q } }, { phone: { contains: q } }],
        },
        orderBy: { name: "asc" },
        take: 8,
        include: {
          tenancies: {
            where: { isActive: true },
            take: 1,
            include: { bed: { include: { room: { select: { number: true } } } } },
          },
        },
      }),
      db.room.findMany({
        where: { number: { contains: q } },
        orderBy: { number: "asc" },
        take: 5,
        include: {
          beds: { select: { id: true, tenancies: { where: { isActive: true }, select: { id: true } } } },
        },
      }),
    ]);

    return ok({
      tenants: tenants.map((t) => {
        const tenancy = t.tenancies[0] ?? null;
        return {
          id: t.id,
          name: t.name,
          phone: t.phone,
          status: t.status,
          room: tenancy?.bed.room.number ?? null,
          bed: tenancy?.bed.label ?? null,
        };
      }),
      rooms: rooms.map((r) => ({
        id: r.id,
        number: r.number,
        floor: r.floor,
        occupiedBeds: r.beds.filter((b) => b.tenancies.length > 0).length,
        totalBeds: r.beds.length,
      })),
    });
  });
}
