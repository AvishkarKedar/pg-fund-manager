"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fmtDate, monthLabelShort } from "@/lib/client";
import type { ImportParseResponse } from "@/lib/client";
import { SectionLabel } from "@/components/pg/bits";

const FIELDS: { key: string; label: string }[] = [
  { key: "room", label: "Room" },
  { key: "bed", label: "Bed" },
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "rent", label: "Rent" },
  { key: "joined", label: "Joined" },
  { key: "deposit", label: "Deposit" },
  { key: "dueDay", label: "Due day" },
  { key: "email", label: "Email" },
  { key: "workplace", label: "Workplace" },
  { key: "idNumber", label: "ID number" },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" },
];

export interface ApplyBody {
  dataRows: string[][];
  headers: string[];
  headerRowIndex: number;
  mapping: Record<string, number>;
  monthColumns: { index: number; period: string }[];
  mode: "MERGE" | "REPLACE";
  defaultRent: number;
  defaultDueDay: number;
}

export function ImportReview({
  parse,
  onBack,
  onApply,
  applying,
}: {
  parse: ImportParseResponse;
  onBack: () => void;
  onApply: (body: ApplyBody) => void;
  applying: boolean;
}) {
  const [mapping, setMapping] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const f of FIELDS) {
      const suggested = parse.suggestedMapping[f.key];
      if (typeof suggested === "number") initial[f.key] = suggested;
    }
    return initial;
  });
  const [monthColumns, setMonthColumns] = useState(parse.monthColumns);
  const [mode, setMode] = useState<"MERGE" | "REPLACE">("MERGE");
  const [defaultRent, setDefaultRent] = useState("6500");
  const [defaultDueDay, setDefaultDueDay] = useState("5");

  const nameMapped = mapping.name !== undefined;
  const tenantRows = parse.stats.tenantRows;

  function toggleMonthCol(index: number) {
    setMonthColumns((cols) => cols.filter((c) => c.index !== index));
  }

  function buildBody(): ApplyBody {
    return {
      dataRows: parse.dataRows,
      headers: parse.headers,
      headerRowIndex: parse.headerRowIndex,
      mapping,
      monthColumns,
      mode,
      defaultRent: Number(defaultRent) || 6500,
      defaultDueDay: Number(defaultDueDay) || 5,
    };
  }

  return (
    <div className="space-y-6">
      {/* file stats */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          `${parse.stats.totalRows} rows`,
          `${tenantRows} tenant rows`,
          `${monthColumns.length} paid-month column${monthColumns.length === 1 ? "" : "s"}`,
          parse.stats.withWarnings > 0 ? `${parse.stats.withWarnings} with warnings` : "no warnings",
        ].map((chip, i) => (
          <span
            key={i}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              i === 3 && parse.stats.withWarnings > 0 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground"
            )}
          >
            {chip}
          </span>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* mapping editor */}
        <Card className="rounded-xl border-border/60 shadow-sm">
          <CardContent className="p-5">
            <SectionLabel>Column mapping</SectionLabel>
            <p className="mb-4 mt-1 text-xs text-muted-foreground">
              Detected automatically — adjust anything that looks wrong. Headers come from sheet “{parse.file.sheet}”.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => {
                const value = mapping[f.key] !== undefined ? String(mapping[f.key]) : "NONE";
                const suggested = parse.suggestedMapping[f.key];
                const auto = typeof suggested === "number" && mapping[f.key] === suggested;
                return (
                  <div key={f.key} className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-xs">
                      {f.label}
                      {f.key === "name" && <span className="text-emerald-600 dark:text-emerald-400">*</span>}
                      {auto && (
                        <span className="rounded-full bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:text-emerald-400">auto</span>
                      )}
                    </Label>
                    <Select
                      value={value}
                      onValueChange={(v) =>
                        setMapping((m) => {
                          const next = { ...m };
                          if (v === "NONE") delete next[f.key];
                          else next[f.key] = Number(v);
                          return next;
                        })
                      }
                    >
                      <SelectTrigger className="h-9 w-full text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="NONE">— not mapped —</SelectItem>
                        {parse.headers.map((h, i) => (
                          <SelectItem key={i} value={String(i)} className="text-xs">
                            <span className="flex items-center gap-1.5">
                              {h || <em className="text-muted-foreground">(blank column)</em>}
                              {suggested === i && <Check className="size-3 text-emerald-600 dark:text-emerald-400" />}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* months + mode + defaults */}
        <div className="space-y-6">
          <Card className="rounded-xl border-border/60 shadow-sm">
            <CardContent className="p-5">
              <SectionLabel>Paid-month columns</SectionLabel>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">
                Columns detected as month markers — a ticked cell marks that month as paid.
              </p>
              {monthColumns.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/60 px-3 py-3 text-xs text-muted-foreground">
                  No month columns detected — only tenant data will be imported.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {monthColumns.map((c) => (
                    <span
                      key={c.index}
                      className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                    >
                      {parse.headers[c.index] || `col ${c.index}`} → {monthLabelShort(c.period)} paid
                      <button
                        onClick={() => toggleMonthCol(c.index)}
                        className="flex size-4 items-center justify-center rounded-full text-emerald-700/60 hover:bg-emerald-500/20 dark:text-emerald-400/60"
                        aria-label={`Remove ${parse.headers[c.index]}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 shadow-sm">
            <CardContent className="p-5">
              <SectionLabel>Import mode</SectionLabel>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => setMode("MERGE")}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    mode === "MERGE" ? "border-emerald-500/40 bg-emerald-500/10" : "border-border/60 hover:bg-muted"
                  )}
                >
                  <p className="text-sm font-medium">Merge</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Keep existing rooms &amp; tenants, match by phone or name</p>
                </button>
                <button
                  onClick={() => setMode("REPLACE")}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    mode === "REPLACE" ? "border-amber-500/50 bg-amber-500/10" : "border-border/60 hover:bg-muted"
                  )}
                >
                  <p className="text-sm font-medium">Replace occupancy</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Rebuild rooms &amp; beds from the sheet</p>
                </button>
              </div>
              {mode === "REPLACE" && (
                <p className="mt-3 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Existing rooms, beds and tenancies are deleted and rebuilt. Payment history, expenses, complaints and settings are always preserved.
                </p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Default rent (₹)</Label>
                  <Input type="number" min="0" value={defaultRent} onChange={(e) => setDefaultRent(e.target.value)} className="h-9" />
                  <p className="text-[11px] text-muted-foreground">Used when a row has no rent</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Default due day</Label>
                  <Input type="number" min="1" max="28" value={defaultDueDay} onChange={(e) => setDefaultDueDay(e.target.value)} className="h-9" />
                  <p className="text-[11px] text-muted-foreground">1–28</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* preview */}
      <Card className="rounded-xl border-border/60 shadow-sm">
        <CardContent className="p-5">
          <SectionLabel>Preview — first {Math.min(12, parse.preview.length)} of {parse.stats.totalRows} rows</SectionLabel>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">Values after auto-fix: normalised phones, day-first dates, room/bed splitting.</p>
          <div className="thin-scroll overflow-x-auto">
            <Table className="min-w-[720px] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Room</TableHead>
                  <TableHead>Bed</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-center">Months paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parse.preview.slice(0, 12).map((r) => (
                  <TableRow key={r.index} className="odd:bg-muted/30 hover:bg-muted/50">
                    <TableCell>
                      {r.warnings.length > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex size-6 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="size-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-56 text-xs">
                              <ul className="list-disc pl-3">
                                {r.warnings.map((w, i) => <li key={i}>{w}</li>)}
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                    <TableCell>{r.room ?? "—"}</TableCell>
                    <TableCell>{r.bed ?? "auto"}</TableCell>
                    <TableCell className={cn("font-medium", !r.name && "text-muted-foreground")}>{r.name ?? "—"}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{r.phone ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.rent != null ? `₹${r.rent.toLocaleString("en-IN")}` : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.joined ? fmtDate(r.joined) : "—"}</TableCell>
                    <TableCell className="text-center tabular-nums">{r.monthsPaid.length || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack} disabled={applying} className="gap-1.5">
          <ArrowLeft className="size-4" /> Choose another file
        </Button>
        <Button
          size="lg"
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          disabled={applying || !nameMapped}
          onClick={() => onApply(buildBody())}
        >
          {applying ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {applying ? "Importing…" : `Import ${parse.dataRows.length} rows`}
        </Button>
      </div>
      {!nameMapped && (
        <p className="text-center text-xs text-amber-700 dark:text-amber-400">Map the “Name” column to continue — tenant rows need a name.</p>
      )}
    </div>
  );
}
