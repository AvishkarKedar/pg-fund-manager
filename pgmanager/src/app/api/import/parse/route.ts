import { requireAuth } from "@/lib/auth";
import { ok, bad, handle } from "@/lib/api";
import { detectHeader, normalizeRows } from "@/lib/import-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import * as XLSX from "xlsx";

export async function POST(req: Request) {
  return handle(async () => {
    const { response } = await requireAuth();
    if (response) return response;

    const form = await req.formData().catch(() => null);
    if (!form) return bad("Expected multipart/form-data with a 'file' field");
    const file = form.get("file");
    if (!(file instanceof File)) return bad("No file uploaded");
    if (file.size === 0) return bad("File is empty");
    if (file.size > 8 * 1024 * 1024) return bad("File too large (max 8 MB)");

    const name = file.name.toLowerCase();
    const isSheet = name.endsWith(".xlsx") || name.endsWith(".xls");
    const isCsv = name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt");
    const isJson = name.endsWith(".json");
    if (!isSheet && !isCsv && !isJson) {
      return bad("Unsupported file type. Upload .xlsx, .xls, .csv, .tsv or .json");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let sheets: { name: string; rows: string[][] }[] = [];

    try {
      if (isJson) {
        const data = JSON.parse(buffer.toString("utf-8"));
        const arr = Array.isArray(data) ? data : Array.isArray(data?.tenants) ? data.tenants : Array.isArray(data?.rows) ? data.rows : null;
        if (!arr) return bad("JSON must be an array of objects (or { tenants: [...] } / { rows: [...] })");
        const headers = [...new Set(arr.flatMap((o: object) => Object.keys(o)))];
        sheets = [{
          name: "json",
          rows: [headers, ...arr.map((o: Record<string, unknown>) => headers.map((h) => String(o[h] ?? "")))],
        }];
      } else {
        // real XLSX parsing (binary) — the legacy app read Excel as text and got garbage
        const wb = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
        sheets = wb.SheetNames.map((sheetName) => {
          const ws = wb.Sheets[sheetName];
          const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
          return {
            name: sheetName,
            rows: raw.map((r) => (Array.isArray(r) ? r.map((c) => (c === null || c === undefined ? "" : String(c))) : [])),
          };
        }).filter((s) => s.rows.length > 0);
      }
    } catch (e) {
      return bad(`Could not parse file: ${e instanceof Error ? e.message : "unknown error"}`);
    }

    if (sheets.length === 0) return bad("The file contains no data rows");

    // pick the sheet with the best header score
    let best = sheets[0];
    let bestScore = -1;
    for (const s of sheets) {
      const det = detectHeader(s.rows.slice(0, 40));
      const score = Object.keys(det.mapping).length + det.monthColumns.length;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }

    const rows = best.rows;
    const detected = detectHeader(rows);
    const normalized = normalizeRows(rows, detected);

    const tenantRows = normalized.filter((r) => r.name);
    const monthCols = detected.monthColumns;

    return ok({
      file: { name: file.name, size: file.size, sheet: best.name, sheets: sheets.map((s) => s.name) },
      headerRowIndex: detected.headerRowIndex,
      headers: detected.headers,
      suggestedMapping: detected.mapping,
      monthColumns: monthCols,
      detectedKind: tenantRows.length >= normalized.length / 2 ? "tenants" : "rooms",
      stats: {
        totalRows: normalized.length,
        tenantRows: tenantRows.length,
        roomOnlyRows: normalized.length - tenantRows.length,
        withWarnings: normalized.filter((r) => r.warnings.length > 0).length,
      },
      preview: normalized.slice(0, 50),
      // raw data rows (post-header) so the client can re-map without re-upload
      dataRows: rows.slice(detected.headerRowIndex + 1, detected.headerRowIndex + 1 + 500).map((r) =>
        r.map((c) => String(c ?? ""))
      ),
    });
  });
}
