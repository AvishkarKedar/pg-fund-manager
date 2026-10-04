/**
 * Excel/CSV import engine with auto-fix and auto-sort.
 *
 * Fixes the legacy import.js bugs by design:
 *  1. /paid/ regex matched "unpaid"  -> word-boundary status parsing
 *  2. default payment year hardcoded to 2026 -> derived from header/current year
 *  3. imports wiped rate card / rules / owner settings -> this engine only
 *     touches rooms, beds, tenants and rent invoices. Settings are untouchable.
 */

export type FieldKey =
  | "room" | "bed" | "name" | "phone" | "rent" | "joined" | "deposit"
  | "dueDay" | "email" | "workplace" | "idNumber" | "status" | "notes"
  | "monthsPaid";

export interface NormalizedRow {
  index: number; // original row number (1-based, data rows)
  room: string | null;
  bed: string | null;
  name: string | null;
  phone: string | null;
  rent: number | null;
  joined: string | null; // ISO date
  deposit: number | null;
  dueDay: number | null;
  email: string | null;
  workplace: string | null;
  idNumber: string | null;
  status: "ACTIVE" | "NOTICE" | null;
  notes: string | null;
  monthsPaid: string[]; // "YYYY-MM" list
  warnings: string[];
}

const FIELD_ALIASES: Record<FieldKey, RegExp> = {
  room: /^(room|room\s*no\.?|room\s*number|rm|unit|flat|room\s*id)$/i,
  bed: /^(bed|bed\s*no\.?|bed\s*letter|slot|berth)$/i,
  name: /^(name|tenant|tenant\s*name|full\s*name|resident|occupant|person)$/i,
  phone: /^(phone|mobile|contact|phone\s*no\.?|mobile\s*no\.?|cell|whatsapp)$/i,
  rent: /^(rent|rent\s*amount|monthly\s*rent|amount|fee|rental)$/i,
  joined: /^(join(ed|ing)?|date\s*of\s*join(ing|ed)?|start(ing)?\s*date|check-?in|since|moved\s*in)$/i,
  deposit: /^(deposit|security|security\s*deposit|dep(osit)?\s*(amt|amount|balance)?|advance)$/i,
  dueDay: /^(due\s*day|collect(ion)?\s*day|payment\s*day|due\s*date\s*day)$/i,
  email: /^(e-?mail|email\s*id|mail)$/i,
  workplace: /^(work|workplace|company|office|employer|organisation|organization)$/i,
  idNumber: /^(id|id\s*(no|number|card)?|aadhaar?|aadhar|pan|id\s*proof\s*no\.?)$/i,
  status: /^(status|notice|on\s*notice)$/i,
  notes: /^(note|notes|remark|remarks|comment|comments)$/i,
  monthsPaid: /^months?\s*paid$|^paid\s*months?$/i,
};

/** Month headers: "Apr 25", "April 2025 paid", "apr25", "2025-04", "04/2025" */
const MONTH_HEADER =
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s'\-/]?(\d{2,4})?|(\d{4})[\s\-/](0[1-9]|1[0-2])|^(0[1-9]|1[0-2])\/(\d{4})$/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseMonthHeader(header: string, currentYear: number): string | null {
  const h = String(header).trim().toLowerCase();
  if (!h) return null;

  // "2025-04" or "2025/04"
  let m = /^(\d{4})[\s\-/](\d{1,2})$/.exec(h);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;

  // month name + optional year
  m = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s'\-/]*(\d{2,4})?$/.exec(h);
  if (m) {
    const monthIdx = MONTHS.indexOf(m[1]);
    let year: number;
    if (m[2]) {
      year = Number(m[2]);
      if (year < 100) year += 2000;
    } else {
      year = currentYear; // derived, never hardcoded
    }
    return `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
  }
  return null;
}

/** Truthy-paid detection with word boundaries — "unpaid" must NOT match. */
export function parsePaidValue(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  if (typeof v === "number") return v > 0;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "p" || s === "✓" || s === "y") return true;
  if (/^(paid|payed|done|ok|yes|true|received|cleared|1)$/.test(s)) return true;
  if (/^(unpaid|not\s*paid|pending|due|no|false|0|overdue|na|n\/a|-)$/.test(s)) return false;
  const n = Number(s.replace(/[₹,\s]/g, ""));
  return isFinite(n) && n > 0;
}

export interface DetectedHeader {
  headerRowIndex: number;
  headers: string[];
  mapping: Partial<Record<FieldKey, number>>;
  monthColumns: { index: number; period: string }[];
}

/** Scan the first 20 rows for the row that looks most like a header. */
export function detectHeader(rows: string[][]): DetectedHeader {
  const currentYear = new Date().getFullYear();
  let best: DetectedHeader | null = null;
  let bestScore = -1;

  const limit = Math.min(rows.length, 20);
  for (let r = 0; r < limit; r++) {
    const row = rows[r].map((c) => String(c ?? "").trim());
    if (row.filter(Boolean).length < 2) continue;

    let score = 0;
    const mapping: Partial<Record<FieldKey, number>> = {};
    const monthColumns: { index: number; period: string }[] = [];
    const used = new Set<number>();

    row.forEach((cell, idx) => {
      if (!cell) return;
      for (const [field, re] of Object.entries(FIELD_ALIASES) as [FieldKey, RegExp][]) {
        if (!used.has(idx) && re.test(cell)) {
          mapping[field] = idx;
          used.add(idx);
          score += 5;
          return;
        }
      }
      if (!used.has(idx)) {
        if (MONTH_HEADER.test(cell)) {
          const period = parseMonthHeader(cell, currentYear);
          if (period) {
            monthColumns.push({ index: idx, period });
            used.add(idx);
            score += 3;
          }
        } else if (/rent|paid|amount|₹/i.test(cell)) {
          score += 1;
        }
      }
    });

    if (score > bestScore) {
      bestScore = score;
      best = { headerRowIndex: r, headers: row, mapping, monthColumns };
    }
  }

  return best ?? { headerRowIndex: 0, headers: (rows[0] ?? []).map((c) => String(c ?? "")), mapping: {}, monthColumns: [] };
}

function cleanPhone(v: string | null): string | null {
  if (!v) return null;
  const digits = v.replace(/[^\d+]/g, "");
  if (!digits) return null;
  const bare = digits.replace(/\+/g, "");
  if (bare.length === 12 && bare.startsWith("91")) return `+91 ${bare.slice(2, 6)} ${bare.slice(6)}`;
  if (bare.length === 10) return `+91 ${bare.slice(0, 4)} ${bare.slice(4)}`;
  return v.trim();
}

function parseNum(v: string | null): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[₹,\s]/g, ""));
  return isFinite(n) ? n : null;
}

function parseDate(v: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s); // day-first Indian
  if (m) {
    let day = Number(m[1]);
    let mon = Number(m[2]);
    if (mon > 12 && day <= 12) [day, mon] = [mon, day]; // month-first file
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  if (/^\d{4}-\d{1,2}$/.test(s)) return `${s.split("-")[0]}-${String(Number(s.split("-")[1])).padStart(2, "0")}-01`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseBedLabel(v: string | null, slotGuess: number): string | null {
  if (!v) return null;
  const s = String(v).trim().toUpperCase();
  const m = /^[A-H]$/.exec(s);
  if (m) return m[1];
  const n = /^\d{1,2}$/.exec(s);
  if (n) {
    const num = Number(n[1]);
    if (num >= 1 && num <= 12) return String.fromCharCode(64 + num); // 1 -> A
  }
  // compound "0101" / "101A" -> bed part
  const compound = /^(\d{2,4})([A-H])$/.exec(s);
  if (compound) return compound[2];
  return String.fromCharCode(64 + Math.min(slotGuess, 8));
}

/** Compound room+bed like "0101" => room 01, bed A; "101" stays room 101. */
function splitRoomBed(roomRaw: string | null, bedRaw: string | null) {
  if (bedRaw && bedRaw.trim()) return { room: roomRaw?.trim() || null, bed: bedRaw.trim() };
  if (!roomRaw) return { room: null, bed: null };
  const s = roomRaw.trim();
  const compound = /^0?(\d{2})(\d{2})$/.exec(s);
  if (compound) {
    // e.g. 0101 => floor 01 room 01 … only treat as compound when bed column absent
    return { room: `${compound[1]}${compound[2]}`, bed: null };
  }
  const withLetter = /^(\d{1,4})[ -]?([A-H])$/.exec(s.toUpperCase());
  if (withLetter) return { room: withLetter[1], bed: withLetter[2] };
  return { room: s, bed: null };
}

export function normalizeRows(
  rows: string[][],
  detected: DetectedHeader,
  mappingOverride?: Partial<Record<FieldKey, number | null>>,
  monthOverride?: { index: number; period: string }[]
): NormalizedRow[] {
  const mapping = { ...detected.mapping };
  if (mappingOverride) {
    for (const [k, v] of Object.entries(mappingOverride) as [FieldKey, number | null][]) {
      if (v === null || v === undefined) delete mapping[k as FieldKey];
      else mapping[k as FieldKey] = v;
    }
  }
  const monthColumns = monthOverride ?? detected.monthColumns;

  const out: NormalizedRow[] = [];
  const roomSeen = new Map<string, number>(); // room -> bed counter for slot guesses

  for (let i = detected.headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (row.every((c) => !String(c ?? "").trim())) continue;

    const get = (field: FieldKey): string | null => {
      const idx = mapping[field];
      if (idx === undefined || idx === null) return null;
      const v = row[idx];
      return v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim();
    };

    const warnings: string[] = [];
    const rawRoom = get("room");
    let rawBed = get("bed");
    const { room, bed } = splitRoomBed(rawRoom, rawBed);

    const name = get("name");
    const phone = cleanPhone(get("phone"));
    let rent = parseNum(get("rent"));
    if (rent !== null && rent < 0) {
      warnings.push("Negative rent ignored");
      rent = null;
    }
    if (rent !== null && rent > 0 && rent < 500) {
      warnings.push(`Rent ₹${rent} looks unusually low`);
    }
    const joined = parseDate(get("joined"));
    if (get("joined") && !joined) warnings.push("Could not parse joining date");
    const deposit = parseNum(get("deposit"));
    let dueDay = parseNum(get("dueDay"));
    if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28)) {
      warnings.push("Due day outside 1–28 ignored");
      dueDay = null;
    }

    const statusRaw = get("status")?.toLowerCase() ?? "";
    const status: "ACTIVE" | "NOTICE" | null =
      /\bnotice\b|leaving|vacating/.test(statusRaw) ? "NOTICE" : null;

    const monthsPaid: string[] = [];
    for (const mc of monthColumns) {
      const v = row[mc.index];
      if (v !== undefined && v !== null && String(v).trim() !== "" && parsePaidValue(v)) {
        monthsPaid.push(mc.period);
      }
    }

    // bed slot guess: order of appearance within a room
    let bedLabel: string | null = null;
    if (name) {
      const counter = (roomSeen.get(room ?? "ALL") ?? 0) + 1;
      roomSeen.set(room ?? "ALL", counter);
      bedLabel = parseBedLabel(bed ?? (rawRoom && splitRoomBed(rawRoom, rawBed).bed), counter);
    }

    if (!name && !room) warnings.push("Row has neither tenant name nor room — will be skipped");

    out.push({
      index: i + 1,
      room,
      bed: name ? bedLabel : parseBedLabel(bed, 1),
      name,
      phone,
      rent,
      joined,
      deposit,
      dueDay,
      email: get("email"),
      workplace: get("workplace"),
      idNumber: get("idNumber"),
      status,
      notes: get("notes"),
      monthsPaid,
      warnings,
    });
  }
  return out;
}

/** Natural sort key for room numbers: "9" < "10" < "101". */
export function roomSortKey(number: string): (number | string)[] {
  const m = /^(\d+)(.*)$/.exec(number.trim());
  if (!m) return [Number.MAX_SAFE_INTEGER, number];
  return [Number(m[1]), m[2] ?? ""];
}
