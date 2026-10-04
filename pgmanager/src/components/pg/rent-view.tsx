"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Download, FileText,
  History, MessageCircle, Phone, ReceiptIndianRupee, Undo2, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { api, useApi, useSignalReload } from "@/hooks/pg/useApi";
import type { PropertySettings, RentResponse, RentRow, Settings, SettingsResponse, TenantDetail } from "@/lib/client";
import { fmtDate, fmtINR, monthLabel, renderReminderTemplate, telLink, todayYm, waLink } from "@/lib/client";
import { roomNaturalKey } from "@/lib/client";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, KpiCard, Money, MonthNav, PageHeader, SectionLabel, StatusBadge } from "@/components/pg/bits";
import { MarkPaidDialog } from "@/components/pg/mark-paid-dialog";
import { StatementPrintDialog, type StatementData } from "@/components/pg/statement-print";

type SortKey = "name" | "room" | "rent" | "outstanding" | "status";

/** Compact ₹ axis ticks: 1.2L / 12k / 900 — no trailing .0 */
const compactAxis = (v: number) =>
  v >= 100000
    ? `${(v / 100000).toFixed(1).replace(/\.0$/, "")}L`
    : v >= 1000
      ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`
      : String(v);

export function RentView({ refreshSignal }: { refreshSignal: number }) {
  const [month, setMonth] = useState(todayYm());
  const { data, error, loading, reload } = useApi<RentResponse>(`/api/rent?month=${month}`);
  useSignalReload(refreshSignal, reload);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "room", dir: "asc" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [markPaid, setMarkPaid] = useState<RentRow | null>(null);
  const [historyRow, setHistoryRow] = useState<RentRow | null>(null);
  const [remindOpen, setRemindOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  // property profile for the statement header + reminder template for WhatsApp links
  const { data: settingsData } = useApi<SettingsResponse>("/api/settings");

  const rows = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.rows];
    const dir = sort.dir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "rent":
          return (a.rent - b.rent) * dir;
        case "outstanding":
          return (a.outstanding - b.outstanding) * dir;
        case "status": {
          const order = { OVERDUE: 0, PARTIAL: 1, DUE: 2, PAID: 3, WAIVED: 4 } as Record<string, number>;
          return ((order[a.invoiceStatus] ?? 9) - (order[b.invoiceStatus] ?? 9)) * dir;
        }
        case "room":
        default: {
          const ka = roomNaturalKey(a.room);
          const kb = roomNaturalKey(b.room);
          const na = Number(ka[0]);
          const nb = Number(kb[0]);
          if (na !== nb) return (na - nb) * dir;
          const c = String(ka[1]).localeCompare(String(kb[1]));
          if (c !== 0) return c * dir;
          return a.bed.localeCompare(b.bed) * dir;
        }
      }
    });
    return sorted;
  }, [data, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const unpaid = rows.filter((r) => r.outstanding > 0);

  // statement payload from the currently loaded (and sorted) roll
  const statement = useMemo<StatementData | null>(() => {
    if (!data || data.rows.length === 0) return null;
    return {
      month: data.month,
      property: settingsData?.settings?.property ?? null,
      rows: rows.map((r) => ({
        room: r.room,
        bed: r.bed,
        name: r.name,
        dueDate: r.dueDate,
        due: r.due,
        paid: r.paid,
        outstanding: r.outstanding,
        method: r.method,
        paidOn: r.paidOn,
      })),
    };
  }, [data, rows, settingsData]);

  return (
    <div>
      <PageHeader
        title="Rent roll"
        subtitle={`Monthly collections${data ? ` · ${data.totals.activeTenancies} active tenancies` : ""}`}
        actions={
          <>
            <MonthNav month={month} onChange={setMonth} showReset />
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => (window.location.href = `/api/reports/export?type=ledger&month=${month}`)}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              disabled={unpaid.length === 0}
              onClick={() => setRemindOpen(true)}
            >
              <MessageCircle className="size-4 text-emerald-600 dark:text-emerald-400" /> Remind unpaid
              <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/15 px-1.5 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {unpaid.length}
              </span>
            </Button>
            <UiTooltip>
              <TooltipTrigger asChild>
                {/* span wrapper keeps the tooltip reachable while the button is disabled */}
                <span className="inline-flex">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    disabled={!statement}
                    onClick={() => setStatementOpen(true)}
                  >
                    <FileText className="size-4" /> Statement
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{statement ? "Print this month's statement" : "Nothing to show"}</TooltipContent>
            </UiTooltip>
          </>
        }
      />

      {loading && !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="rounded-xl"><CardContent className="p-5 md:p-6">
                <Skeleton className="h-4 w-24" /><Skeleton className="mt-3 h-8 w-32" /><Skeleton className="mt-3 h-2 w-full" />
              </CardContent></Card>
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <div className="space-y-6">
          {/* summary */}
          <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
            <KpiCard icon={ReceiptIndianRupee} label="Expected" value={fmtINR(data.totals.expected)} sub={`${data.totals.activeTenancies} invoices this month`} tone="neutral" />
            <KpiCard
              icon={History}
              label="Collected"
              value={fmtINR(data.totals.collected)}
              sub={`${data.totals.counts.PAID ?? 0} of ${data.totals.activeTenancies} invoices settled`}
              tone="emerald"
              progress={data.totals.expected > 0 ? (data.totals.collected / data.totals.expected) * 100 : 0}
              progressLabel="Collection rate"
              progressValue={`${data.totals.expected > 0 ? Math.round((data.totals.collected / data.totals.expected) * 100) : 0}%`}
            />
            <KpiCard
              icon={Users}
              label="Pending"
              value={fmtINR(data.totals.pending)}
              sub={
                <span className="flex flex-wrap gap-1">
                  {(["PAID", "PARTIAL", "DUE", "OVERDUE"] as const).map((k) =>
                    data.totals.counts[k] ? (
                      <span key={k} className="inline-flex items-center gap-1">
                        <StatusBadge status={k} /> {data.totals.counts[k]}
                      </span>
                    ) : null
                  )}
                </span>
              }
              tone={data.totals.pending > 0 ? "amber" : "emerald"}
            />
          </div>

          {/* 6 month mini chart */}
          <Card className="rounded-xl border-border/60 shadow-sm">
            <CardContent className="px-2 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4">
                <SectionLabel>Collected vs expected — last 6 months</SectionLabel>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-emerald-500" aria-hidden /> Collected
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-slate-400/60 dark:bg-slate-500/60" aria-hidden /> Expected
                  </span>
                </div>
              </div>
              <div className="mt-2 h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.history} margin={{ top: 4, right: 12, left: 4, bottom: 0 }} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
                    <YAxis
                      tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground"
                      allowDecimals={false}
                      tickFormatter={compactAxis}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)" }}
                      formatter={(value: number | string, name: string) => [fmtINR(Number(value)), name === "collected" ? "Collected" : "Expected"]}
                      contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }}
                    />
                    <Bar dataKey="collected" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expected" fill="currentColor" className="text-muted-foreground/30" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* table */}
          <Card className="rounded-xl border-border/60 shadow-sm">
            {rows.length === 0 ? (
              <EmptyState
                icon={ReceiptIndianRupee}
                title={`No invoices for ${data.label}`}
                hint="Invoices are generated automatically for active tenancies."
                className="py-12"
              />
            ) : (
              <div className="thin-scroll overflow-x-auto">
                <Table className="min-w-[860px] text-sm">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-8" />
                      <SortHead label="Room" k="room" sort={sort} onClick={toggleSort} />
                      <SortHead label="Tenant" k="name" sort={sort} onClick={toggleSort} />
                      <SortHead label="Rent" k="rent" sort={sort} onClick={toggleSort} />
                      <TableHead className="text-right">Due</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <SortHead label="Outstanding" k="outstanding" sort={sort} onClick={toggleSort} right />
                      <SortHead label="Status" k="status" sort={sort} onClick={toggleSort} />
                      <TableHead>Method / Ref</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <RentRowView
                        key={r.invoiceId}
                        row={r}
                        expanded={expanded === r.invoiceId}
                        onToggle={() => setExpanded(expanded === r.invoiceId ? null : r.invoiceId)}
                        onMarkPaid={() => setMarkPaid(r)}
                        onHistory={() => setHistoryRow(r)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      <MarkPaidDialog
        open={!!markPaid}
        onClose={() => setMarkPaid(null)}
        invoice={
          markPaid
            ? { invoiceId: markPaid.invoiceId, tenantName: markPaid.name, outstanding: markPaid.outstanding }
            : null
        }
        onDone={reload}
      />
      <InvoiceHistoryDialog open={!!historyRow} onClose={() => setHistoryRow(null)} row={historyRow} month={month} onReversed={reload} />
      <RemindDialog
        open={remindOpen}
        onClose={() => setRemindOpen(false)}
        rows={unpaid}
        month={month}
        settings={settingsData?.settings ?? null}
      />
      <StatementPrintDialog open={statementOpen} onClose={() => setStatementOpen(false)} data={statement} />
    </div>
  );
}

function SortHead({
  label,
  k,
  sort,
  onClick,
  right,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onClick: (k: SortKey) => void;
  right?: boolean;
}) {
  const Icon: LucideIcon = sort.key === k ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={right ? "text-right" : undefined}>
      <button
        onClick={() => onClick(k)}
        className={cn("inline-flex items-center gap-1 rounded font-medium hover:text-foreground", sort.key === k && "text-emerald-600 dark:text-emerald-400")}
      >
        {label}
        <Icon className="size-3" />
      </button>
    </TableHead>
  );
}

function RentRowView({
  row,
  expanded,
  onToggle,
  onMarkPaid,
  onHistory,
}: {
  row: RentRow;
  expanded: boolean;
  onToggle: () => void;
  onMarkPaid: () => void;
  onHistory: () => void;
}) {
  const overdue = row.outstanding > 0;
  return (
    <>
      <TableRow
        className="cursor-pointer odd:bg-muted/30 hover:bg-muted/50 hover:odd:bg-muted/50 [&_td]:py-3"
        onClick={onToggle}
      >
        <TableCell className="w-8">
          <Button variant="ghost" size="icon" className="size-7" aria-label="Toggle details" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </TableCell>
        <TableCell className="whitespace-nowrap font-medium">
          {row.room}
          <span className="text-muted-foreground">-{row.bed}</span>
        </TableCell>
        <TableCell className="whitespace-nowrap">
          <span className="font-medium">{row.name}</span>
          {row.phone && (
            <a href={telLink(row.phone)} onClick={(e) => e.stopPropagation()} className="ml-2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Call ${row.name}`}>
              <Phone className="size-3.5" />
            </a>
          )}
        </TableCell>
        <TableCell className="text-right"><Money value={row.rent} /></TableCell>
        <TableCell className="text-right"><Money value={row.due} /></TableCell>
        <TableCell className="text-right"><Money value={row.paid} /></TableCell>
        <TableCell className="text-right">
          <Money
            value={row.outstanding}
            muted={!overdue}
            className={overdue ? "text-rose-600 dark:text-rose-400" : undefined}
          />
        </TableCell>
        <TableCell><StatusBadge status={row.invoiceStatus} /></TableCell>
        <TableCell className="max-w-40 truncate text-xs text-muted-foreground">
          {row.method ? `${row.method}${row.reference ? ` · ${row.reference}` : ""}` : "—"}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1.5">
            {row.outstanding > 0 && (
              <Button
                size="sm"
                className="h-8 bg-emerald-600 px-2.5 text-xs hover:bg-emerald-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkPaid();
                }}
              >
                Mark paid
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2.5 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onHistory();
              }}
            >
              <History className="size-3.5" /> History
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={9} className="px-4 py-3 text-xs text-muted-foreground">
            <div className="grid gap-2 sm:grid-cols-4">
              <span>Due day: <b className="text-foreground">{row.dueDay}</b></span>
              <span>Due date: <b className="text-foreground">{fmtDate(row.dueDate)}</b></span>
              <span>Paid on: <b className="text-foreground">{row.paidOn ? fmtDate(row.paidOn) : "—"}</b></span>
              <span>Tenant status: <b className="text-foreground">{row.status.toLowerCase()}</b></span>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function InvoiceHistoryDialog({
  open,
  onClose,
  row,
  month,
  onReversed,
}: {
  open: boolean;
  onClose: () => void;
  row: RentRow | null;
  month: string;
  onReversed: () => void;
}) {
  const detail = useApi<TenantDetail>(open && row ? `/api/tenants/${row.tenantId}` : null);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const payments = detail.data?.payments ?? [];
  const periodPayments = payments.filter((p) => p.date.slice(0, 7) === month);
  const list = showAll ? payments : periodPayments;

  async function reverse(paymentId: string) {
    if (busyId) return;
    setBusyId(paymentId);
    try {
      await api("/api/rent/unmark", { body: { paymentId } });
      toast.success("Payment reversed", { description: "Invoice status recalculated from the payment log." });
      onReversed();
      detail.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reverse payment");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment history</DialogTitle>
          <DialogDescription>
            {row ? `${row.name} · Room ${row.room}-${row.bed} · ${fmtINR(row.paid)} paid of ${fmtINR(row.due)}` : ""}
          </DialogDescription>
        </DialogHeader>
        {detail.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={History} title="No payments found" hint="Nothing recorded for this period yet." className="py-6" />
        ) : (
          <div className="thin-scroll max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {list.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5",
                  p.reversedAt && "opacity-60"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", p.reversedAt && "line-through")}>
                    <Money value={p.amount} /> · {p.method}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {fmtDate(p.date)} · {p.receiptNumber}
                    {p.reversedAt ? " · reversed" : ""}
                  </p>
                </div>
                {p.reversedAt ? (
                  <span className="inline-flex shrink-0 items-center rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                    Reversed
                  </span>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={busyId === p.id} onClick={() => reverse(p.id)}>
                    <Undo2 className="size-3.5" /> Reverse
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show only this month's payments" : `Show all ${payments.length} payments for this tenant`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RemindDialog({
  open,
  onClose,
  rows,
  month,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  rows: RentRow[];
  month: string;
  settings: Settings | null;
}) {
  const property: PropertySettings | null | undefined = settings?.property ?? undefined;

  /** WhatsApp message from the Settings reminder template (falls back to the built-in default). */
  function reminderMessage(r: RentRow): string {
    return renderReminderTemplate(settings?.reminderTemplate, {
      name: r.name,
      first_name: r.name.split(" ")[0],
      property: property?.name ?? "",
      room: r.room,
      bed: r.bed,
      month: monthLabel(month, true),
      amount: fmtINR(r.outstanding),
      due_day: String(r.dueDay),
      phone: r.phone ?? "",
      upi: property?.upiId ?? "",
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="size-5 text-emerald-600 dark:text-emerald-400" />
            Remind unpaid tenants
          </DialogTitle>
          <DialogDescription>
            {rows.length} tenant{rows.length === 1 ? "" : "s"} with outstanding rent for {monthLabel(month)}. Tap WhatsApp to send a
            ready-made reminder from your template — nothing is sent automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="thin-scroll max-h-96 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((r) => (
            <div key={r.invoiceId} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  Room {r.room}-{r.bed} · owes <Money value={r.outstanding} className="text-rose-600 dark:text-rose-400" />
                </p>
              </div>
              <StatusBadge status={r.invoiceStatus} />
              {r.phone && (
                <a
                  href={waLink(r.phone, reminderMessage(r))}
                  target="_blank"
                  rel="noreferrer"
                  title={reminderMessage(r)}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
                  aria-label={`WhatsApp ${r.name}`}
                >
                  <MessageCircle className="size-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
