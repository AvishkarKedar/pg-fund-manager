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

    const complaint = await db.complaint.findUnique({ where: { id } });
    if (!complaint) return bad("Issue not found", 404);

    const body = await readJson<{
      status?: string; cost?: number; notes?: string; title?: string; priority?: string;
      addExpense?: boolean;
    }>(req);

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!["OPEN", "IN_PROGRESS", "RESOLVED"].includes(body.status)) return bad("Invalid status");
      data.status = body.status;
      data.resolvedAt = body.status === "RESOLVED" ? new Date() : null;
    }
    if (body.cost !== undefined) {
      const cost = Number(body.cost);
      if (!isFinite(cost) || cost < 0) return bad("Cost must be positive");
      data.cost = cost === 0 ? null : new Decimal(cost);
    }
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (body.title !== undefined) data.title = String(body.title).trim() || complaint.title;
    if (body.priority !== undefined) {
      if (!["LOW", "MEDIUM", "HIGH"].includes(body.priority)) return bad("Invalid priority");
      data.priority = body.priority;
    }

    const updated = await db.complaint.update({ where: { id }, data });

    // resolving with a cost can auto-log the repair expense
    if (body.status === "RESOLVED" && body.addExpense && updated.cost && updated.cost.gt(0)) {
      await db.expense.create({
        data: {
          date: new Date(),
          category: "REPAIR",
          amount: updated.cost,
          vendor: null,
          notes: `Auto-logged from issue: ${updated.title}${updated.roomLabel ? ` (room ${updated.roomLabel})` : ""}`,
        },
      });
    }

    await audit(user.id, "UPDATED", "Complaint", id, body);
    return ok({
      complaint: {
        ...updated,
        cost: updated.cost === null ? null : Number(updated.cost),
      },
    });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;
    const { id } = await ctx.params;
    const complaint = await db.complaint.findUnique({ where: { id } });
    if (!complaint) return bad("Issue not found", 404);
    await db.complaint.delete({ where: { id } });
    await audit(user.id, "DELETED", "Complaint", id, { title: complaint.title });
    return ok({ success: true });
  });
}
