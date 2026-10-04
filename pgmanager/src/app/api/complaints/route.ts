import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { COMPLAINT_CATEGORIES } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const { response } = await requireAuth();
    if (response) return response;

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";

    const complaints = await db.complaint.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: "asc" }, { date: "desc" }],
    });

    const list = complaints.map((c) => ({
      id: c.id,
      title: c.title,
      roomLabel: c.roomLabel,
      category: c.category,
      priority: c.priority,
      status: c.status,
      cost: c.cost === null ? null : Number(c.cost),
      notes: c.notes,
      date: c.date,
      resolvedAt: c.resolvedAt,
    }));

    return ok({
      complaints: list,
      counts: {
        OPEN: list.filter((c) => c.status === "OPEN").length,
        IN_PROGRESS: list.filter((c) => c.status === "IN_PROGRESS").length,
        RESOLVED: list.filter((c) => c.status === "RESOLVED").length,
      },
      categories: [...COMPLAINT_CATEGORIES],
    });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const body = await readJson<{
      title?: string; roomId?: string; category?: string; priority?: string; notes?: string;
    }>(req);

    const title = String(body.title ?? "").trim();
    if (!title) return bad("Issue title is required");
    const category = String(body.category ?? "OTHER");
    if (!(COMPLAINT_CATEGORIES as readonly string[]).includes(category)) return bad("Invalid category");
    const priority = ["LOW", "MEDIUM", "HIGH"].includes(String(body.priority)) ? String(body.priority) : "MEDIUM";

    let roomLabel: string | null = null;
    if (body.roomId) {
      const room = await db.room.findUnique({ where: { id: body.roomId } });
      if (!room) return bad("Room not found", 404);
      roomLabel = room.number;
    }

    const complaint = await db.complaint.create({
      data: {
        title,
        roomId: body.roomId || null,
        roomLabel,
        category,
        priority,
        status: "OPEN",
        notes: body.notes?.trim() || null,
      },
    });
    await audit(user.id, "CREATED", "Complaint", complaint.id, { title, roomLabel });
    return ok({ complaint: { ...complaint, cost: null } }, { status: 201 });
  });
}
