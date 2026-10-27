import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { parseUPIName, getCurrentMonth } from "@/lib/utils";

// POST /api/bank-import — parse uploaded CSV/XLSX and return preview
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const confirmed = formData.get("confirmed") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length < 2) {
      return NextResponse.json(
        { error: "File appears empty or has no data rows" },
        { status: 400 }
      );
    }

    // Parse headers
    const headers = rows[0].map((h: string) => h.trim().toLowerCase());
    const dateIdx = findCol(headers, ["value date", "date", "txn date", "transaction date"]);
    const descIdx = findCol(headers, ["description", "narration", "particulars", "details"]);
    const creditIdx = findCol(headers, ["credit", "credit amount", "deposit", "cr"]);
    const debitIdx = findCol(headers, ["debit", "debit amount", "withdrawal", "dr"]);
    const balanceIdx = findCol(headers, ["balance", "closing balance"]);
    const refIdx = findCol(headers, ["chq/ref no", "ref no", "transaction id", "reference", "utr"]);

    if (dateIdx === -1 || descIdx === -1) {
      return NextResponse.json(
        { error: "Could not find required columns (Date and Description). Please check column mapping." },
        { status: 400 }
      );
    }

    const dataRows = rows.slice(1).filter((r: string[]) => r.some((c) => c.trim()));

    // Parse and structure transactions
    interface ParsedTxn {
      slNo: number; valueDate: string; originalDescription: string; parsedName: string | null;
      amount: number; type: string; balance: number | null; reference: string | null;
      suggestedTenantId?: string; suggestedTenantName?: string; suggestedBed?: string | null;
      suggestedMonth?: string; confidence?: number; status?: string; isDuplicate?: boolean;
    }
    const transactions: ParsedTxn[] = dataRows.map((row: string[], idx: number) => {
      const rawDesc = row[descIdx]?.trim() || "";
      const parsedName = parseUPIName(rawDesc);
      const amount = parseAmount(row, creditIdx, debitIdx);
      const type = creditIdx >= 0 && parseFloat((row[creditIdx] || "0").replace(/[^\d.-]/g, "")) > 0
        ? "CREDIT"
        : "DEBIT";

      return {
        slNo: idx + 1,
        valueDate: parseDate(row[dateIdx]),
        originalDescription: rawDesc,
        parsedName,
        amount,
        type,
        balance: balanceIdx >= 0 ? parseNum(row[balanceIdx]) : null,
        reference: refIdx >= 0 ? row[refIdx]?.trim() || null : null,
      };
    }).filter((t: any) => t.amount !== 0);

    // Check for duplicates
    const existingRefs = await prisma.bankTransaction.findMany({
      where: {
        reference: { not: null, in: transactions.filter((t: any) => t.reference).map((t: any) => t.reference) },
      },
      select: { reference: true },
    });
    const existingRefSet = new Set(existingRefs.map((e) => e.reference));

    transactions.forEach((t: any) => {
      if (t.reference && existingRefSet.has(t.reference)) {
        t.isDuplicate = true;
      }
    });

    // Auto-match to tenants
    const allTenants = await prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      include: { aliases: true, assignments: { where: { isActive: true }, include: { bed: { include: { room: true } } } } },
    });

    const month = getCurrentMonth();

    for (const txn of transactions) {
      if (txn.parsedName) {
        const normalizedName = txn.parsedName.toLowerCase().replace(/\s+/g, " ").trim();

        // Match by alias or tenant name
        const match = allTenants.find((t) => {
          const tenantName = t.name.toLowerCase().replace(/\s+/g, " ").trim();
          if (normalizedName.includes(tenantName) || tenantName.includes(normalizedName)) return true;
          return t.aliases.some((a) => {
            const alias = a.alias.toLowerCase().replace(/\s+/g, " ").trim();
            return normalizedName.includes(alias) || alias.includes(normalizedName);
          });
        });

        if (match) {
          const assignment = match.assignments[0];
          txn.suggestedTenantId = match.id;
          txn.suggestedTenantName = match.name;
          txn.suggestedBed = assignment
            ? `Room ${assignment.bed.room.number} · Bed ${assignment.bed.number}`
            : null;
          txn.suggestedMonth = month;
          txn.confidence = calculateConfidence(normalizedName, match);
          txn.status = "UNMATCHED"; // Will be matched on confirm
        }
      }
    }

    // If confirmed, save to database
    if (confirmed) {
      const batch = await prisma.importBatch.create({
        data: {
          fileName: file.name,
          fileType: file.name.endsWith(".xlsx") || file.name.endsWith(".xls") ? "xlsx" : "csv",
          rowCount: transactions.length,
          matchedCount: transactions.filter((t: any) => t.suggestedTenantId).length,
          status: "processing",
        },
      });

      const dbTransactions = transactions.map((t: any) => ({
        importBatchId: batch.id,
        slNo: t.slNo,
        valueDate: new Date(t.valueDate),
        originalDescription: t.originalDescription,
        parsedDescription: t.parsedName ? `Matched: ${t.parsedName}` : null,
        parsedName: t.parsedName,
        amount: t.amount,
        type: t.type as any,
        balance: t.balance,
        reference: t.reference,
        isDuplicate: t.isDuplicate || false,
        status: "UNMATCHED" as const,
      }));

      await prisma.bankTransaction.createMany({ data: dbTransactions });

      await prisma.importBatch.update({
        where: { id: batch.id },
        data: { status: "completed", completedAt: new Date() },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          action: "IMPORT",
          entity: "bank_transaction",
          entityId: batch.id,
          newValue: JSON.stringify({ fileName: file.name, count: transactions.length }),
        },
      });

      return NextResponse.json({
        ok: true,
        batchId: batch.id,
        total: transactions.length,
        matched: transactions.filter((t: any) => t.suggestedTenantId).length,
        duplicates: transactions.filter((t: any) => t.isDuplicate).length,
      });
    }

    // Preview mode
    return NextResponse.json({
      ok: true,
      preview: true,
      transactions: transactions.slice(0, 50),
      total: transactions.length,
      matched: transactions.filter((t: any) => t.suggestedTenantId).length,
      duplicates: transactions.filter((t: any) => t.isDuplicate).length,
    });
  } catch (error) {
    console.error("Bank import error:", error);
    return NextResponse.json({ error: "Failed to process bank statement" }, { status: 500 });
  }
}

// GET /api/bank-import — list imported transactions
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const batchId = searchParams.get("batchId");

    const where: any = {};
    if (status) where.status = status;
    if (batchId) where.importBatchId = batchId;

    const transactions = await prisma.bankTransaction.findMany({
      where,
      include: { importBatch: true },
      orderBy: { valueDate: "desc" },
      take: 200,
    });

    return NextResponse.json(transactions);
  } catch (error) {
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; continue; }
      if (c === '"') { inQuotes = false; continue; }
      field += c;
    } else {
      if (c === '"') { inQuotes = true; continue; }
      if (c === ",") { current.push(field); field = ""; continue; }
      if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        current.push(field);
        rows.push(current);
        current = [];
        field = "";
        continue;
      }
      field += c;
    }
  }
  current.push(field);
  rows.push(current);
  return rows.filter((r) => r.some((c) => c.trim()));
}

function findCol(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.indexOf(c);
    if (idx !== -1) return idx;
  }
  // Fuzzy match
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h.includes(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseAmount(row: string[], creditIdx: number, debitIdx: number): number {
  const credit = creditIdx >= 0 ? parseNum(row[creditIdx]) : 0;
  const debit = debitIdx >= 0 ? parseNum(row[debitIdx]) : 0;
  return credit - debit;
}

function parseNum(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseDate(value: string): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const cleaned = value.trim();

  // Try DD-MM-YYYY or DD/MM/YYYY
  const dmy = cleaned.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }

  // Try YYYY-MM-DD
  const ymd = cleaned.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }

  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

function calculateConfidence(parsedName: string, tenant: any): number {
  const name = tenant.name.toLowerCase().replace(/\s+/g, " ").trim();
  const normalized = parsedName.toLowerCase().replace(/\s+/g, " ").trim();

  if (normalized === name) return 100;
  if (normalized.includes(name) || name.includes(normalized)) return 90;

  const aliasMatch = tenant.aliases.some((a: any) => {
    const alias = a.alias.toLowerCase().replace(/\s+/g, " ").trim();
    return normalized.includes(alias) || alias.includes(normalized);
  });
  if (aliasMatch) return 85;

  // Partial word match
  const nameWords = name.split(" ");
  const parsedWords = normalized.split(" ");
  const matched = nameWords.filter((w: string) => parsedWords.some((pw: string) => pw.includes(w) || w.includes(pw)));
  return Math.min(50 + matched.length * 15, 80);
}
