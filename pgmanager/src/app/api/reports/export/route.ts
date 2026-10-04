import { db } from "@/lib/db";
import { requireAuth, audit } from "@/lib/auth";
import { ok, bad, handle } from "@/lib/api";
import { periodLabel, todayYm, periodStart, addMonths } from "@/lib/dates";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return `\uFEFF${lines.join("\r\n")}`; // BOM so Excel opens ₹/UTF-8 correctly
}

export async function GET(req: Request) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "ledger";
    const month = url.searchParams.get("month") || todayYm();
    if (!/^\d{4}-\d{2}$/.test(month)) return bad("Invalid month");

    let csv = "";
    let filename = "export.csv";

    if (type === "ledger") {
      const invoices = await db.rentInvoice.findMany({
        where: { period: month },
        include: { tenancy: { include: { tenant: true, bed: { include: { room: true } } } } },
        orderBy: [{ tenancy: { bed: { room: { floor: "asc" } } } }, { tenancy: { bed: { slot: "asc" } } }],
      });
      csv = toCsv(
        ["Room", "Bed", "Tenant", "Phone", "Rent", "Due", "Paid", "Outstanding", "Status", "Method", "Reference", "Paid On"],
        invoices.map((i) => [
          i.tenancy.bed.room.number,
          i.tenancy.bed.label,
          i.tenancy.tenant.name,
          i.tenancy.tenant.phone ?? "",
          Number(i.tenancy.monthlyRent),
          Number(i.dueAmount),
          Number(i.paidAmount),
          Math.max(0, Number(i.dueAmount) - Number(i.paidAmount)),
          i.status,
          i.method ?? "",
          i.reference ?? "",
          i.paidOn ? i.paidOn.toISOString().slice(0, 10) : "",
        ])
      );
      filename = `rent-ledger-${month}.csv`;
    } else if (type === "tenants") {
      const tenants = await db.tenant.findMany({
        include: { tenancies: { where: { isActive: true }, include: { bed: { include: { room: true } } } } },
        orderBy: { name: "asc" },
      });
      csv = toCsv(
        ["Name", "Phone", "Email", "Room", "Bed", "Monthly Rent", "Deposit", "Due Day", "Joined", "Status", "Workplace", "Emergency Contact"],
        tenants.map((t) => {
          const ten = t.tenancies[0];
          return [
            t.name,
            t.phone ?? "",
            t.email ?? "",
            ten?.bed.room.number ?? "",
            ten?.bed.label ?? "",
            ten ? Number(ten.monthlyRent) : "",
            ten ? Number(ten.securityDeposit) : "",
            ten?.dueDay ?? "",
            ten?.startDate ? ten.startDate.toISOString().slice(0, 10) : "",
            t.status,
            t.workplace ?? "",
            t.emergencyContact ?? "",
          ];
        })
      );
      filename = "tenants.csv";
    } else if (type === "expenses") {
      const from = periodStart(addMonths(month, -11));
      const expenses = await db.expense.findMany({
        where: { date: { gte: from, lt: periodStart(addMonths(month, 1)) } },
        orderBy: { date: "desc" },
      });
      csv = toCsv(
        ["Date", "Category", "Amount", "Vendor", "Notes"],
        expenses.map((e) => [
          e.date.toISOString().slice(0, 10),
          e.category,
          Number(e.amount),
          e.vendor ?? "",
          e.notes ?? "",
        ])
      );
      filename = `expenses-${month}.csv`;
    } else if (type === "payments") {
      const from = periodStart(addMonths(month, -11));
      const payments = await db.payment.findMany({
        where: { date: { gte: from, lt: periodStart(addMonths(month, 1)) } },
        include: { tenant: true, rentInvoice: { select: { period: true } } },
        orderBy: { date: "desc" },
      });
      csv = toCsv(
        ["Receipt No", "Date", "Tenant", "Period", "Amount", "Method", "Reference", "Reversed", "Notes"],
        payments.map((p) => [
          p.receiptNumber,
          p.date.toISOString().slice(0, 10),
          p.tenant.name,
          p.rentInvoice?.period ?? "",
          Number(p.amount),
          p.method,
          p.reference ?? "",
          p.reversedAt ? "YES" : "",
          p.notes ?? "",
        ])
      );
      filename = `payments-${month}.csv`;
    } else {
      return bad("Unknown export type");
    }

    await audit(user.id, "SYSTEM", "Export", undefined, { type, month });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });
}
