import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getCurrentMonth } from "@/lib/utils";

// GET /api/tenants/[id]
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireAuth();

    const [tenant, auditLogs] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id },
        include: {
          assignments: {
            include: {
              bed: { include: { room: true } },
              rentRecords: { orderBy: { month: "desc" } },
            },
          },
          payments: {
            where: { isReversed: false },
            orderBy: { date: "desc" },
          },
          aliases: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { entityId: id },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Compute financial summary
    const allPayments = tenant.payments.filter((p: any) => !p.isReversed);
    const totalPaid = allPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);

    const currentAssignment = tenant.assignments.find((a: any) => a.isActive);
    const monthlyRent = currentAssignment ? Number(currentAssignment.monthlyRent) : 0;

    // Count paid months from rent records
    const paidMonths = tenant.assignments.flatMap((a: any) =>
      a.rentRecords.filter((r: any) => r.status === "PAID" || r.status === "ADVANCE")
    ).length;
    const totalMonths = tenant.assignments.flatMap((a: any) => a.rentRecords).length;

    return NextResponse.json({
      ...tenant,
      _summary: {
        totalPaid,
        monthlyRent,
        totalPayments: allPayments.length,
        paidMonths,
        totalMonths,
        outstanding: currentAssignment
          ? Math.max(0, monthlyRent - (currentAssignment.rentRecords[0]
              ? Number(currentAssignment.rentRecords[0].amountPaid) : 0))
          : 0,
      },
      _auditLogs: auditLogs.map((l: any) => ({
        id: l.id,
        action: l.action,
        entity: l.entity,
        user: l.user?.name || "System",
        previousValue: l.previousValue,
        newValue: l.newValue,
        createdAt: l.createdAt,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load tenant" }, { status: 500 });
  }
}

// PUT /api/tenants/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requireAuth();
    const body = await request.json();

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        name: body.name || tenant.name,
        phone: body.phone !== undefined ? body.phone : tenant.phone,
        email: body.email !== undefined ? body.email : tenant.email,
        emergencyContact: body.emergencyContact !== undefined ? body.emergencyContact : tenant.emergencyContact,
        status: body.status || tenant.status,
        notes: body.notes !== undefined ? body.notes : tenant.notes,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entity: "tenant",
        entityId: id,
        previousValue: JSON.stringify({ name: tenant.name }),
        newValue: JSON.stringify({ name: updated.name, status: updated.status }),
      },
    });

    return NextResponse.json({ ok: true, tenant: updated });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update tenant" }, { status: 500 });
  }
}

// DELETE /api/tenants/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requireAuth();

    // Soft delete: mark as CHECKED_OUT, don't remove from DB
    const updated = await prisma.tenant.update({
      where: { id },
      data: { status: "CHECKED_OUT" },
    });

    // Deactivate current assignment
    await prisma.tenantAssignment.updateMany({
      where: { tenantId: id, isActive: true },
      data: { isActive: false, checkoutDate: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entity: "tenant",
        entityId: id,
        newValue: JSON.stringify({ status: "CHECKED_OUT" }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to remove tenant" }, { status: 500 });
  }
}
