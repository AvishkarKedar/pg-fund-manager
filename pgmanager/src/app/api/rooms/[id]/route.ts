import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { Decimal } from "decimal.js";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;
    const { id } = await ctx.params;

    const room = await db.room.findUnique({ where: { id }, include: { beds: true } });
    if (!room) return bad("Room not found", 404);

    const body = await readJson<{
      number?: string; floor?: number; defaultRent?: number;
      roomType?: string; notes?: string; addBeds?: number; removeBedId?: string;
    }>(req);

    const data: Record<string, unknown> = {};
    if (body.number !== undefined) {
      const number = String(body.number).trim();
      if (!number) return bad("Room number cannot be empty");
      const dupe = await db.room.findFirst({ where: { number, NOT: { id } } });
      if (dupe) return bad(`Room ${number} already exists`, 409);
      data.number = number;
    }
    if (body.floor !== undefined) {
      const floor = Number(body.floor);
      if (!Number.isInteger(floor) || floor < 0 || floor > 30) return bad("Floor must be 0–30");
      data.floor = floor;
    }
    if (body.defaultRent !== undefined) {
      const rent = Number(body.defaultRent);
      if (!isFinite(rent) || rent < 0) return bad("Rent must be positive");
      data.defaultRent = new Decimal(rent);
    }
    if (body.roomType !== undefined) data.roomType = body.roomType === "PRIVATE" ? "PRIVATE" : "SHARED";
    if (body.notes !== undefined) data.notes = String(body.notes).trim() || null;

    if (body.addBeds !== undefined) {
      const add = Number(body.addBeds);
      if (!Number.isInteger(add) || add < 0 || room.beds.length + add > 12) {
        return bad("A room can hold at most 12 beds");
      }
      for (let i = 1; i <= add; i++) {
        const slot = room.beds.length + i;
        await db.bed.create({
          data: { roomId: room.id, slot, label: String.fromCharCode(64 + slot) },
        });
      }
    }
    if (body.removeBedId !== undefined) {
      const bed = await db.bed.findUnique({
        where: { id: body.removeBedId },
        include: { tenancies: { where: { isActive: true } } },
      });
      if (!bed || bed.roomId !== room.id) return bad("Bed not found in this room", 404);
      if (bed.tenancies.length > 0) return bad("Bed is occupied — move the tenant out first", 409);
      await db.bed.delete({ where: { id: bed.id } });
    }

    const updated = await db.room.update({ where: { id }, data });
    await audit(user.id, "UPDATED", "Room", id, body);
    return ok({ room: { ...updated, defaultRent: Number(updated.defaultRent) } });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;
    const { id } = await ctx.params;

    const room = await db.room.findUnique({
      where: { id },
      include: { beds: { include: { tenancies: { where: { isActive: true } } } } },
    });
    if (!room) return bad("Room not found", 404);
    const occupied = room.beds.filter((b) => b.tenancies.length > 0).length;
    if (occupied > 0) {
      return bad(`Cannot delete room ${room.number} — ${occupied} bed(s) still occupied`, 409);
    }
    // keep financial history: detach past complaints, then cascade beds
    await db.complaint.updateMany({ where: { roomId: id }, data: { roomId: null, roomLabel: room.number } });
    await db.room.delete({ where: { id } });
    await audit(user.id, "DELETED", "Room", id, { number: room.number });
    return ok({ success: true });
  });
}
