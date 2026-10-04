"use client";

import { useState } from "react";
import {
  Banknote, Check, ChevronsUpDown, CreditCard, Download, FileText, FilterX,
  Landmark, Plus, Printer, ReceiptText, Search, Smartphone, Undo2, Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { api, useApi, useDebounced, useSignalReload } from "@/hooks/pg/useApi";
import type { PaymentRow, PaymentsResponse, PropertySettings, RentResponse, TenantsResponse } from "@/lib/client";
import { fmtDate, fmtINR, initials, todayIsoDate, todayYm } from "@/lib/client";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, Money, PageHeader, StatusBadge } from "@/components/pg/bits";
import { ReceiptPrintDialog, type ReceiptData } from "@/components/pg/receipt-print";

const METHODS = ["UPI", "CASH", "BANK", "CARD", "CHEQUE"] as const;

const METHOD_ICONS: Record<string, LucideIcon> = {
  UPI: Smartphone,
  CASH: Banknote,
  BANK: Landmark,
  CARD: CreditCard,
  CHEQUE: FileText,
};

export function PaymentsView({ refreshSignal, property }: { refreshSignal: number; property?: PropertySettings | null }) {
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 350);
  const [method, setMethod] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: "50" });
  if (q) params.set("q", q);
  if (method !== "ALL") params.set("method", method);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const { data, error, loading, reload } = useApi<PaymentsResponse>(`/api/payments?${params.toString()}`);
  useSignalReload(refreshSignal, reload);

  const [recordOpen, setRecordOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [reverseTarget, setReverseTarget] = useState<PaymentRow | null>(null);

  const hasFilters = q || method !== "ALL" || from || to;

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={data ? `${data.total} payment${data.total === 1 ? "" : "s"} in the ledger` : "Payment ledger"}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => (window.location.href = "/api/reports/export?type=payments")}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setRecordOpen(true)}>
              <Plus className="size-4" /> Record payment
            </Button>
          </>
        }
      />

      {/* filters */}
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tenant, receipt no or UTR…"
            className="h-10 pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search payments"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={method} onValueChange={(v) => { setMethod(v); setPage(1); }}>
            <SelectTrigger className="h-10 w-full sm:w-36" aria-label="Filter by method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All methods</SelectItem>
              {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" className="h-10 w-full sm:w-38" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From date" />
          <span className="hidden text-xs text-muted-foreground sm:block">to</span>
          <Input type="date" className="h-10 w-full sm:w-38" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To date" />
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 gap-1.5 text-muted-foreground"
              onClick={() => { setSearch(""); setMethod("ALL"); setFrom(""); setTo(""); setPage(1); }}
            >
              <FilterX className="size-4" /> Clear
            </Button>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.payments.length === 0 ? (
        <Card className="rounded-xl border-border/60 shadow-sm">
          <EmptyState
            icon={ReceiptText}
            title={hasFilters ? "No payments match your filters" : "No payments yet"}
            hint={hasFilters ? "Try widening the date range or clearing filters." : "Recorded rent and advance payments appear here with printable receipts."}
            action={
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setRecordOpen(true)}>
                <Plus className="size-4" /> Record payment
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="rounded-xl border-border/60 shadow-sm">
          <div className="thin-scroll overflow-x-auto">
            <Table className="min-w-[820px] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payments.map((p) => {
                  const Icon = METHOD_ICONS[p.method] ?? Wallet;
                  return (
                    <TableRow key={p.id} className={cn("odd:bg-muted/30 hover:odd:bg-muted/50", p.reversedAt && "opacity-60")}>
                      <TableCell className="font-mono text-xs">{p.receiptNumber}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(p.date)}</TableCell>
                      <TableCell className={cn("font-medium", p.reversedAt && "line-through")}>{p.tenantName}</TableCell>
                      <TableCell className="text-muted-foreground">{p.period ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Money value={p.amount} className={cn(p.reversedAt && "line-through")} />
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                          <Icon className="size-3.5 text-muted-foreground" />
                          {p.method}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-36 truncate text-xs text-muted-foreground">{p.reference ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {p.reversedAt ? (
                            <StatusBadge status="DUE" className="border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                              Reversed
                            </StatusBadge>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 text-xs"
                                onClick={() =>
                                  setReceipt({
                                    receiptNumber: p.receiptNumber,
                                    amount: p.amount,
                                    date: p.date,
                                    method: p.method,
                                    reference: p.reference,
                                    tenantName: p.tenantName,
                                    period: p.period,
                                    notes: p.notes,
                                  })
                                }
                              >
                                <Printer className="size-3.5" /> Receipt
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                                onClick={() => setReverseTarget(p)}
                              >
                                <Undo2 className="size-3.5" /> Reverse
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {/* pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}
              <span className="ml-2">· {fmtINR(data.pageSum)} on this page</span>
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8" disabled={data.page <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </Button>
              <Button variant="outline" size="sm" className="h-8" disabled={data.page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      <RecordPaymentDialog open={recordOpen} onClose={() => setRecordOpen(false)} onSaved={reload} />
      <ReceiptPrintDialog open={!!receipt} onClose={() => setReceipt(null)} receipt={receipt} property={property} />
      <AlertDialog open={!!reverseTarget} onOpenChange={(v) => !v && setReverseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {reverseTarget && (
                <>
                  {fmtINR(reverseTarget.amount)} from {reverseTarget.tenantName} · {reverseTarget.receiptNumber}. The entry stays in the ledger
                  but is struck through — linked rent invoices are recalculated automatically.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep payment</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={async () => {
                if (!reverseTarget) return;
                try {
                  await api(`/api/payments/${reverseTarget.id}/reverse`, { body: {} });
                  toast.success("Payment reversed", { description: reverseTarget.receiptNumber });
                  reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Reverse failed");
                } finally {
                  setReverseTarget(null);
                }
              }}
            >
              Reverse payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------- record payment ---------------- */
function RecordPaymentDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const tenants = useApi<TenantsResponse>(open ? `/api/tenants?month=${todayYm()}` : null);
  const rent = useApi<RentResponse>(open ? `/api/rent?month=${todayYm()}` : null);

  const [tenantId, setTenantId] = useState<string>("");
  const [tenantName, setTenantName] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [method, setMethod] = useState("UPI");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceId, setInvoiceId] = useState("NONE");
  const [busy, setBusy] = useState(false);

  function pick(id: string, name: string) {
    setTenantId(id);
    setTenantName(name);
    setPickerOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!tenantId) {
      toast.error("Choose a tenant");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ payment: { receiptNumber: string } }>("/api/payments", {
        body: {
          tenantId,
          amount: amt,
          date,
          method,
          reference: reference || undefined,
          notes: notes || undefined,
          rentInvoiceId: invoiceId !== "NONE" ? invoiceId : undefined,
        },
      });
      toast.success(`Payment recorded — ${fmtINR(amt)}`, { description: `Receipt ${res.payment.receiptNumber}` });
      onSaved();
      onClose();
      setTenantId("");
      setTenantName("");
      setAmount("");
      setReference("");
      setNotes("");
      setInvoiceId("NONE");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record payment");
    } finally {
      setBusy(false);
    }
  }

  const openInvoices = (rent.data?.rows ?? []).filter((r) => r.outstanding > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>Any payment — rent, advance or deposit. Link it to a rent month to auto-settle the invoice.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {/* tenant combobox */}
          <div className="space-y-1.5">
            <Label>Tenant *</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="h-10 w-full justify-between font-normal" aria-expanded={pickerOpen}>
                  {tenantName || (tenants.loading ? "Loading tenants…" : "Search and select tenant…")}
                  <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Type a name or phone…" />
                  <CommandList className="thin-scroll">
                    <CommandEmpty>No tenant found.</CommandEmpty>
                    <CommandGroup>
                      {(tenants.data?.tenants ?? []).map((t) => (
                        <CommandItem
                          key={t.id}
                          value={`${t.name} ${t.phone ?? ""} ${t.room ?? ""}`}
                          onSelect={() => pick(t.id, t.name)}
                        >
                          <Check className={cn("size-4", tenantId === t.id ? "opacity-100" : "opacity-0")} />
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                              {initials(t.name)}
                            </span>
                            <span className="truncate">{t.name}</span>
                            {t.room && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t.room}-{t.bed}</span>}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Amount (₹) *</Label>
              <Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="6500" required />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference / UTR</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional" />
            </div>
          </div>

          {/* link to rent invoice */}
          <div className="space-y-1.5">
            <Label>Link to rent month (optional)</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Not linked" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Not linked — keep as advance / deposit</SelectItem>
                {openInvoices.map((r) => (
                  <SelectItem key={r.invoiceId} value={r.invoiceId}>
                    {r.room}-{r.bed} · {r.name} · owes {fmtINR(r.outstanding)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {rent.loading ? "Loading this month's invoices…" : "Linking settles the linked invoice automatically."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
