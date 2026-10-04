import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { Decimal } from "decimal.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const roomsRaw = await db.room.findMany({
      orderBy: [{ floor: "asc" }, { number: "asc" }],
      include: {
        beds: {
          orderBy: { slot: "asc" },
          include: {
            tenancies: {
              where: { isActive: true },
              include: { tenant: true },
            },
          },
        },
      },
    });
    // natural numeric sort: "9" < "10" < "101" (string sort would misplace these)
    const rooms = roomsRaw.sort((a, b) => {
      const ka = /^(\d+)(.*)$/.exec(a.number);
      const kb = /^(\d+)(.*)$/.exec(b.number);
      if (a.floor !== b.floor) return a.floor - b.floor;
      if (ka && kb) {
        const na = Number(ka[1]);
        const nb = Number(kb[1]);
        if (na !== nb) return na - nb;
        return (ka[2] ?? "").localeCompare(kb[2] ?? "");
      }
      return a.number.localeCompare(b.number);
    });

    return ok({
      rooms: rooms.map((r) => ({
        id: r.id,
        number: r.number,
        floor: r.floor,
        roomType: r.roomType,
        defaultRent: Number(r.defaultRent),
        notes: r.notes,
        occupiedCount: r.beds.filter((b) => b.tenancies.length > 0).length,
        beds: r.beds.map((b) => {
          const t = b.tenancies[0];
          return {
            id: b.id,
            label: b.label,
            slot: b.slot,
            status: t ? (t.tenant.status === "NOTICE" ? "NOTICE" : "OCCUPIED") : "VACANT",
            tenant: t
              ? {
                  id: t.tenantId,
                  name: t.tenant.name,
                  phone: t.tenant.phone,
                  status: t.tenant.status,
                  monthlyRent: Number(t.monthlyRent),
                  dueDay: t.dueDay,
                  tenancyId: t.id,
                  startDate: t.startDate,
                }
              : null,
          };
        }),
      })),
    });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const body = await readJson<{
      number?: string; floor?: number; bedCount?: number;
      defaultRent?: number; roomType?: string; notes?: string;
    }>(req);

    const number = String(body.number ?? "").trim();
    if (!number) return bad("Room number is required");
    const floor = Number(body.floor ?? 1);
    if (!Number.isInteger(floor) || floor < 0 || floor > 30) return bad("Floor must be 0–30");
    const bedCount = Number(body.bedCount ?? 1);
    if (!Number.isInteger(bedCount) || bedCount < 1 || bedCount > 12) return bad("Bed count must be 1–12");
    const rent = Number(body.defaultRent ?? 0);
    if (!isFinite(rent) || rent < 0) return bad("Rent must be a positive number");
    const roomType = body.roomType === "PRIVATE" ? "PRIVATE" : "SHARED";

    const existing = await db.room.findUnique({ where: { number } });
    if (existing) return bad(`Room ${number} already exists`, 409);

    const room = await db.room.create({
      data: {
        number,
        floor,
        roomType,
        defaultRent: new Decimal(rent),
        notes: body.notes?.trim() || null,
      },
    });
    const beds = [];
    for (let i = 1; i <= bedCount; i++) {
      beds.push(
        await db.bed.create({
          data: { roomId: room.id, slot: i, label: String.fromCharCode(64 + i) },
        })
      );
    }
    await audit(user.id, "CREATED", "Room", room.id, { number, floor, bedCount, rent });
    return ok({ room: { id: room.id, number, floor, roomType, defaultRent: rent }, beds: beds.length }, { status: 201 });
  });
}
