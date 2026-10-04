import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";
import { recordPayment } from "@/lib/rent-engine";
import { parseFlexibleDate, todayIST } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const { response } = await requireAuth();
    if (response) return response;

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const method = url.searchParams.get("method") ?? "";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") ?? 50)));

    const where: Record<string, unknown> = {};
    if (method) where.method = method;
    if (from || to) {
      where.date = {
        ...(from ? { gte: parseFlexibleDate(from) ?? undefined } : {}),
        ...(to ? { lte: parseFlexibleDate(to) ?? undefined } : {}),
      };
    }
    if (q) {
      where.OR = [
        { receiptNumber: { contains: q } },
        { reference: { contains: q } },
        { tenant: { name: { contains: q } } },
      ];
    }

    const [total, payments] = await Promise.all([
      db.payment.count({ where }),
      db.payment.findMany({
        where,
        orderBy: { date: "desc" },
        take: pageSize,
        skip: (page - 1) * pageSize,
        include: {
          tenant: true,
          rentInvoice: { select: { period: true } },
        },
      }),
    ]);

    const list = payments.map((p) => ({
      id: p.id,
      tenantId: p.tenantId,
      tenantName: p.tenant.name,
      tenantPhone: p.tenant.phone,
      period: p.rentInvoice?.period ?? null,
      amount: Number(p.amount),
      date: p.date,
      method: p.method,
      reference: p.reference,
      receiptNumber: p.receiptNumber,
      notes: p.notes,
      reversedAt: p.reversedAt,
    }));

    const sum = payments.reduce((s, p) => s + Number(p.amount), 0);
    return ok({ payments: list, total, page, pageSize, pageSum: sum });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { user, response } = await requireAuth();
    if (response) return response;

    const body = await readJson<{
      tenantId?: string; amount?: number; date?: string; method?: string;
      reference?: string; notes?: string; rentInvoiceId?: string;
    }>(req);

    const tenantId = String(body.tenantId ?? "");
    if (!tenantId) return bad("tenantId is required");
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return bad("Tenant not found", 404);

    const amount = Number(body.amount);
    if (!isFinite(amount) || amount <= 0) return bad("Amount must be greater than zero");

    const method = ["UPI", "CASH", "BANK", "CARD", "CHEQUE"].includes(String(body.method))
      ? String(body.method)
      : "UPI";
    const date = body.date ? parseFlexibleDate(body.date) : todayIST();
    if (!date) return bad("Invalid payment date");

    const payment = await recordPayment({
      tenantId,
      rentInvoiceId: body.rentInvoiceId ?? null,
      amount,
      date,
      method,
      reference: body.reference?.trim() || null,
      notes: body.notes?.trim() || null,
      recordedById: user.id,
    });

    return ok(
      {
        payment: {
          id: payment.id,
          amount: Number(payment.amount),
          receiptNumber: payment.receiptNumber,
          date: payment.date,
          method: payment.method,
        },
      },
      { status: 201 }
    );
  });
}
