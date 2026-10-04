"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ReceiptIndianRupee } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, useApi } from "@/hooks/pg/useApi";
import type { TenantDetail } from "@/lib/client";
import { fmtINR, monthLabel, todayIsoDate, todayYm } from "@/lib/client";
import { Money } from "@/components/pg/bits";

const METHODS = ["UPI", "CASH", "BANK", "CARD", "CHEQUE"];

export interface MarkPaidTarget {
  invoiceId: string;
  tenantName: string;
  outstanding: number;
}

export function MarkPaidDialog({
  open,
  onClose,
  invoice,
  tenant,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  invoice?: MarkPaidTarget | null;
  tenant?: { id: string; name: string } | null;
  onDone: () => void;
}) {
  // when only a tenant is given, resolve this month's invoice from their ledger
  const detail = useApi<TenantDetail>(open && !invoice && tenant ? `/api/tenants/${tenant.id}` : null);
  const resolved = useMemo<MarkPaidTarget | null>(() => {
    if (invoice) return invoice;
    if (detail.data && tenant) {
      const inv = detail.data.invoices.find((i) => i.period === todayYm() && i.status !== "WAIVED" && i.due - i.paid > 0);
      if (inv) return { invoiceId: inv.id, tenantName: tenant.name, outstanding: inv.due - inv.paid };
    }
    return null;
  }, [invoice, detail.data, tenant]);

  const loadingResolve = !invoice && !!tenant && detail.loading;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("UPI");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMethod("UPI");
      setReference("");
      setNotes("");
      setDate(todayIsoDate());
      setAmount(resolved ? String(resolved.outstanding) : "");
    }
  }, [open, resolved]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolved || busy) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ payment: { receiptNumber: string; amount: number } }>("/api/rent/mark", {
        body: {
          invoiceId: resolved.invoiceId,
          amount: amt,
          method,
          reference: reference || undefined,
          date,
          notes: notes || undefined,
        },
      });
      toast.success(`Payment recorded — ${fmtINR(res.payment.amount)}`, {
        description: `Receipt ${res.payment.receiptNumber} · ${resolved.tenantName}`,
      });
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptIndianRupee className="size-5 text-emerald-600 dark:text-emerald-400" />
            Mark rent paid
          </DialogTitle>
          <DialogDescription>
            {resolved ? (
              <>
                {resolved.tenantName} · outstanding <Money value={resolved.outstanding} className="text-rose-600 dark:text-rose-400" />
              </>
            ) : (
              "Record a rent payment against this month's invoice"
            )}
          </DialogDescription>
        </DialogHeader>

        {loadingResolve ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Finding this month&apos;s invoice…
          </div>
        ) : !resolved ? (
          <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
            No open rent invoice for {tenant?.name ?? "this tenant"} in {monthLabel(todayYm(), true)}. Late payment? Record it from the
            Payments tab instead.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="mp-amount">Amount (₹)</Label>
                <Input id="mp-amount" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mp-date">Date</Label>
                <Input id="mp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mp-ref">Reference / UTR</Label>
                <Input id="mp-ref" placeholder="e.g. 4021 8834" value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-notes">Notes</Label>
              <Textarea id="mp-notes" rows={2} placeholder="Optional note" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
                {busy && <Loader2 className="size-4 animate-spin" />}
                Record payment
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
