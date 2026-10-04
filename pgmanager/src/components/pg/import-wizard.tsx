"use client";

import { useRef, useState } from "react";
import {
  ArrowRight, BarChart3, CheckCircle2, FileSpreadsheet, FileUp, Lightbulb,
  Loader2, RotateCcw, Sparkles, Table2, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { api as apiJson, apiUpload } from "@/hooks/pg/useApi";
import type { ImportApplyResponse, ImportParseResponse } from "@/lib/client";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, PageHeader, SectionLabel } from "@/components/pg/bits";
import { ImportReview, type ApplyBody } from "@/components/pg/import-review";

const TEMPLATE_ROWS = [
  "Room,Bed,Name,Phone,Rent,Joined,Deposit,Status,Notes",
  "101,A,Ravi Kumar,+91 98765 43210,6500,5/3/2025,6500,,Prefers early breakfast",
  "101,B,Amit Verma,9822011234,6500,12/6/2025,6500,notice,",
];

function downloadTemplate() {
  const csv = TEMPLATE_ROWS.join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pg-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Template downloaded", { description: "Fill it in Excel or Google Sheets and upload it back." });
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportWizard({ onImported, onGoDashboard }: { onImported: () => void; onGoDashboard: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parse, setParse] = useState<ImportParseResponse | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ImportApplyResponse | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    if (parsing) return;
    setFile(f);
    setParseError(null);
    setParse(null);
    setStep(2);
    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await apiUpload<ImportParseResponse>("/api/import/parse", form);
      setParse(res);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Could not parse file");
      toast.error(e instanceof Error ? e.message : "Could not parse file");
    } finally {
      setParsing(false);
    }
  }

  async function handleApply(body: ApplyBody) {
    if (applying) return;
    setApplying(true);
    setApplyError(null);
    try {
      const res = await apiJson<ImportApplyResponse>("/api/import/apply", { body });
      setResult(res);
      setStep(3);
      toast.success("Import complete", {
        description: `${res.summary.tenantsCreated} tenants created · ${res.summary.paymentsCreated} payments recorded`,
      });
      onImported();
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : "Import failed");
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setApplying(false);
    }
  }

  function reset() {
    setStep(1);
    setFile(null);
    setParse(null);
    setParseError(null);
    setResult(null);
    setApplyError(null);
  }

  return (
    <div>
      <PageHeader
        title="Import from Excel"
        subtitle="Bring your existing register in from Excel, CSV or Google Sheets — smart detection included"
        actions={
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={downloadTemplate}>
            <FileSpreadsheet className="size-4" /> Download template
          </Button>
        }
      />

      {/* stepper */}
      <ol className="mb-8 flex items-center gap-2 sm:gap-4">
        {[
          { n: 1, label: "Upload file", icon: FileUp },
          { n: 2, label: "Review mapping", icon: Table2 },
          { n: 3, label: "Done", icon: CheckCircle2 },
        ].map((s, i) => {
          const done = step > s.n;
          const active = step === s.n;
          return (
            <li key={s.n} className="flex flex-1 items-center gap-2 sm:gap-3">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-all",
                  done
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : active
                      ? "border-emerald-600 bg-emerald-600 text-white ring-4 ring-emerald-500/15"
                      : "border-border/60 text-muted-foreground"
                )}
              >
                {done ? <CheckCircle2 className="size-4" /> : <s.icon className="size-4" />}
              </span>
              <span
                className={cn(
                  "hidden text-xs sm:block",
                  active
                    ? "font-semibold text-foreground"
                    : done
                      ? "font-medium text-foreground"
                      : "font-medium text-muted-foreground"
                )}
              >
                {s.label}
              </span>
              {i < 2 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-0.5 flex-1 rounded-full transition-colors",
                    done ? "bg-emerald-500/60" : "bg-border dark:bg-border/80"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <div className="grid gap-6 md:grid-cols-[2fr_1fr] lg:max-w-5xl">
          <div>
            <button
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-all md:p-14",
                dragging
                  ? "scale-[1.01] border-emerald-500 bg-emerald-500/10"
                  : "border-border hover:border-emerald-500/50 hover:bg-emerald-500/5"
              )}
              aria-label="Upload spreadsheet"
            >
              <div
                className={cn(
                  "flex size-14 items-center justify-center rounded-xl transition-colors",
                  dragging ? "bg-emerald-600 text-white" : "bg-emerald-500/10"
                )}
              >
                <FileSpreadsheet className={cn("size-7", dragging ? "text-white" : "text-emerald-600 dark:text-emerald-400")} />
              </div>
              <div>
                <p className={cn("text-sm font-semibold", dragging && "text-emerald-700 dark:text-emerald-400")}>
                  {dragging ? "Drop to upload" : "Drop your Excel / CSV here or browse"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dragging ? "Release the file and we'll start reading it" : ".xlsx · .xls · .csv · .tsv · .json — up to 8 MB, 2000 rows"}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-lg border px-4 py-2 text-xs font-medium transition-colors",
                  dragging
                    ? "border-transparent bg-emerald-600 text-white"
                    : "border-border/60"
                )}
              >
                {dragging ? "Release to upload" : "Choose file"}
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="space-y-3">
            <SectionLabel>What happens automatically</SectionLabel>
            {[
              { icon: Lightbulb, title: "Smart column detection", text: "Recognises room, name, phone, rent, dates — even aliased headers." },
              { icon: Wrench, title: "Auto-fixes data", text: "Normalises phones (+91 format), day-first Indian dates, ₹ amounts." },
              { icon: Sparkles, title: "Auto-sorts & dedupes", text: "Rooms/beds sorted A–Z, duplicate tenants merged by phone." },
            ].map((c) => (
              <Card key={c.title} className="rounded-xl border-border/60 shadow-sm">
                <CardContent className="flex gap-3 p-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                    <c.icon className="size-4.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{c.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.text}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
            <FileSpreadsheet className="size-8 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file?.name}</p>
              <p className="text-xs text-muted-foreground">{file ? fmtSize(file.size) : ""} · upload again to start over</p>
            </div>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={reset} disabled={parsing}>
              <RotateCcw className="size-4" /> Re-upload
            </Button>
          </div>

          {parsing ? (
            <Card className="rounded-xl border-border/60 shadow-sm">
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Loader2 className="size-8 animate-spin text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-medium">Reading your file…</p>
                <p className="text-xs text-muted-foreground">Detecting headers, month columns and fixing values</p>
              </div>
            </Card>
          ) : parseError ? (
            <Card className="rounded-xl border-rose-500/30 shadow-sm">
              <ErrorState message={parseError} onRetry={reset} />
            </Card>
          ) : parse ? (
            <ImportReview parse={parse} onBack={reset} onApply={handleApply} applying={applying} />
          ) : null}
        </div>
      )}

      {step === 3 && result && (
        <div className="space-y-6">
          {/* summary tiles */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Rooms created", value: result.summary.roomsCreated },
              { label: "Beds created", value: result.summary.bedsCreated },
              { label: "Tenants created", value: result.summary.tenantsCreated },
              { label: "Tenants merged", value: result.summary.tenantsMerged },
              { label: "Payments recorded", value: result.summary.paymentsCreated },
              { label: "Invoices created", value: result.summary.invoicesCreated },
              { label: "Rows skipped", value: result.summary.rowsSkipped },
              { label: "Warnings", value: result.warnings.length },
            ].map((t) => (
              <Card key={t.label} className="rounded-xl border-border/60 shadow-sm">
                <CardContent className="p-5">
                  <SectionLabel>{t.label}</SectionLabel>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums">{t.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* auto-sort line */}
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm">
            <Sparkles className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              <b>Auto-sort:</b> {result.sortResult.bedsRelabeled} beds relabeled, {result.sortResult.slotsRenumbered} slots renumbered,{" "}
              {result.sortResult.invoicesRefreshed} invoices self-healed.
            </span>
          </div>

          {/* warnings */}
          {result.warnings.length > 0 ? (
            <Card className="rounded-xl border-amber-500/30 shadow-sm">
              <CardContent className="p-5">
                <SectionLabel className="text-amber-700 dark:text-amber-400">Warnings</SectionLabel>
                <ul className="mt-3 space-y-2">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="flex gap-2 rounded-lg bg-amber-500/5 px-3 py-2 text-sm">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" />
                      {w}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              Every row imported cleanly — no warnings.
            </div>
          )}

          {applyError && <ErrorState message={applyError} onRetry={reset} />}

          <div className="flex flex-wrap gap-3">
            <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={onGoDashboard}>
              <BarChart3 className="size-4" /> Go to dashboard
              <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="outline" className="gap-2" onClick={reset}>
              <RotateCcw className="size-4" /> Import another file
            </Button>
          </div>
        </div>
      )}

      {step === 3 && !result && !applyError && (
        <EmptyState icon={FileSpreadsheet} title="Nothing imported yet" hint="Upload a file to get started." />
      )}
    </div>
  );
}
