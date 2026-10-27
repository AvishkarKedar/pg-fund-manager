import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getCurrentMonth, generateReceiptNumber } from "@/lib/utils";

// GET /api/rent?month=2026-08 — Get rent status for a specific month
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || getCurrentMonth();

    // Get PG start date from settings
    const startSetting = await prisma.setting.findUnique({ where: { key: "pg_start_date" } });
    const pgStartDate = startSetting?.value || null;
    const startDateFilter = pgStartDate ? { gte: new Date(pgStartDate) } : undefined;

    // Get all active assignments with their tenant and bed info
    // Filter by PG start date: only show tenants who joined on or after the start date
    const assignments = await prisma.tenantAssignment.findMany({
      where: {
        isActive: true,
        ...(startDateFilter ? { joiningDate: startDateFilter } : {}),
      },
      include: {
        tenant: { include: { assignments: { include: { rentRecords: true } } } },
        bed: { include: { room: true } },
        rentRecords: { where: { month } },
      },
    });

    // Build tenant rent data
    const tenantRent = assignments.map((a) => {
      const rr = a.rentRecords[0];
      const rentDue = Number(a.monthlyRent);
      const paid = rr ? Number(rr.amountPaid) : 0;
      const remaining = Math.max(0, rentDue - paid);
      const status = rr?.status || (paid > 0 ? "PARTIAL" : "DUE");

      // Check if overdue (past due date and unpaid)
      const now = new Date();
      const dueDay = a.dueDate || 5;
      const monthDate = new Date(month + "-01");
      const dueDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), dueDay);
      const isOverdue = status !== "PAID" && status !== "ADVANCE" && now > dueDate;

      return {
        tenantId: a.tenantId,
        tenantName: a.tenant.name,
        phone: a.tenant.phone,
        roomId: a.bed.room.id,
        roomNumber: a.bed.room.number,
        bedId: a.bedId,
        bedNumber: a.bed.number,
        monthlyRent: rentDue,
        securityDeposit: a.securityDeposit ? Number(a.securityDeposit) : 0,
        dueDate: a.dueDate || 5,
        joiningDate: a.joiningDate,
        paid,
        remaining,
        status: isOverdue ? "OVERDUE" : status,
        rentRecordId: rr?.id || null,
        paidMonths: a.tenant.assignments?.[0]?.rentRecords?.length || 0,
      };
    }).sort((a, b) => {
      // Sort: Overdue first, then Partial, then Due, then Paid
      const order: Record<string, number> = { OVERDUE: 0, PARTIAL: 1, DUE: 2, PAID: 3, ADVANCE: 4 };
      const diff = (order[a.status] || 2) - (order[b.status] || 2);
      if (diff !== 0) return diff;
      return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
    });

    // Summary stats
    const totalExpected = tenantRent.reduce((s, t) => s + t.monthlyRent, 0);
    const totalCollected = tenantRent.reduce((s, t) => s + t.paid, 0);
    const totalOutstanding = tenantRent.reduce((s, t) => s + t.remaining, 0);
    const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

    const paidCount = tenantRent.filter((t) => t.status === "PAID" || t.status === "ADVANCE").length;
    const partialCount = tenantRent.filter((t) => t.status === "PARTIAL").length;
    const dueCount = tenantRent.filter((t) => t.status === "DUE").length;
    const overdueCount = tenantRent.filter((t) => t.status === "OVERDUE").length;

    // Month-over-month comparison (last 6 months, but not before PG start date)
    const monthHistory: { month: string; label: string; expected: number; collected: number; rate: number }[] = [];
    const now = new Date();
    const pgStart = pgStartDate ? new Date(pgStartDate) : new Date("2020-01-01");
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

      // Skip months before PG start date
      if (d < pgStart) {
        monthHistory.push({ month: mk, label, expected: 0, collected: 0, rate: 0 });
        continue;
      }

      const rr = await prisma.rentRecord.findMany({ where: { month: mk } });
      const expected = rr.reduce((s, r) => s + Number(r.rentDue), 0);
      const collected = rr.reduce((s, r) => s + Number(r.amountPaid), 0);
      const rate = expected > 0 ? Math.round((collected / expected) * 100) : 0;
      monthHistory.push({ month: mk, label, expected, collected, rate });
    }

    // Recent payments for this month
    const recentPayments = await prisma.payment.findMany({
      where: { rentMonth: month, isReversed: false },
      include: { tenant: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 10,
    });

    return NextResponse.json({
      month,
      monthLabel: new Date(month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      tenantRent,
      summary: {
        totalExpected,
        totalCollected,
        totalOutstanding,
        collectionRate,
        totalTenants: tenantRent.length,
        paidCount,
        partialCount,
        dueCount,
        overdueCount,
      },
      monthHistory,
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        tenantName: p.tenant.name,
        amount: Number(p.amount),
        date: p.date,
        method: p.method,
        receiptNumber: p.receiptNumber,
      })),
    });
  } catch (error) {
    console.error("Rent API error:", error);
    return NextResponse.json({ error: "Failed to load rent data" }, { status: 500 });
  }
}

// POST /api/rent — Quick mark a tenant's rent as paid for a month
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { tenantId, month, amount, method } = body;

    if (!tenantId || !month) {
      return NextResponse.json({ error: "Tenant and month are required" }, { status: 400 });
    }

    // Find the active assignment
    const assignment = await prisma.tenantAssignment.findFirst({
      where: { tenantId, isActive: true },
      include: { bed: { include: { room: true } }, tenant: true },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Tenant has no active assignment" }, { status: 400 });
    }

    const rentDue = Number(assignment.monthlyRent);
    const paymentAmount = amount ? parseFloat(amount) : rentDue;

    // Find or create rent record
    let rentRecord = await prisma.rentRecord.findUnique({
      where: { assignmentId_month: { assignmentId: assignment.id, month } },
    });

    if (!rentRecord) {
      rentRecord = await prisma.rentRecord.create({
        data: {
          assignmentId: assignment.id,
          tenantId,
          bedId: assignment.bedId,
          month,
          rentDue,
          status: "DUE",
        },
      });
    }

    // Create payment
    const receiptNumber = generateReceiptNumber();
    const payment = await prisma.payment.create({
      data: {
        tenantId,
        amount: paymentAmount,
        date: new Date(),
        method: method || "CASH",
        purpose: "Rent",
        rentMonth: month,
        receiptNumber,
        createdBy: user.id,
        rentRecordId: rentRecord.id,
      },
    });

    // Update rent record
    const newPaid = Number(rentRecord.amountPaid) + paymentAmount;
    const newStatus = newPaid >= rentDue ? (newPaid > rentDue ? "ADVANCE" : "PAID") : "PARTIAL";

    await prisma.rentRecord.update({
      where: { id: rentRecord.id },
      data: { amountPaid: newPaid, status: newStatus as any },
    });

    // Create receipt
    await prisma.receipt.create({
      data: {
        receiptNumber,
        paymentId: payment.id,
        tenantId,
        tenantName: assignment.tenant.name,
        roomNumber: assignment.bed.room.number,
        bedNumber: assignment.bed.number,
        amount: paymentAmount,
        paymentDate: new Date(),
        paymentMethod: method || "CASH",
        rentMonth: month,
        previousBalance: rentDue - Number(rentRecord.amountPaid),
        amountPaid: paymentAmount,
        remainingBalance: Math.max(0, rentDue - newPaid),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entity: "payment",
        entityId: payment.id,
        newValue: JSON.stringify({ tenantId, amount: paymentAmount, month }),
      },
    });

    return NextResponse.json({
      ok: true,
      payment,
      receiptNumber,
      newStatus,
      remaining: Math.max(0, rentDue - newPaid),
    });
  } catch (error) {
    console.error("Rent payment error:", error);
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
}
