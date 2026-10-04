"use client";

import { useState } from "react";
import {
  ArrowRightLeft, BellOff, BellRing, CalendarCheck, MoreHorizontal, MessageCircle,
  Phone, Pencil, Printer, ReceiptIndianRupee, Upload, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { api, useApi } from "@/hooks/pg/useApi";
import type { PropertySettings, RoomCard, TenantDetail, TenantRow } from "@/lib/client";
import { fmtDate, fmtINR, initials, RENT_REMINDER, telLink, todayIsoDate, waLink } from "@/lib/client";
import { cn } from "@/lib/utils";
import { EmptyState, Money, SectionLabel, StatusBadge } from "@/components/pg/bits";
import { BackfillDialog, CheckoutDialog, TenantFormDialog, TransferDialog } from "@/components/pg/tenant-dialogs";
import { MarkPaidDialog } from "@/components/pg/mark-paid-dialog";
import { ReceiptPrintDialog, type ReceiptData } from "@/components/pg/receipt-print";

export function TenantDetailSheet({
  open,
  onClose,
  tenantId,
  rooms,
  property,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string | null;
  rooms: RoomCard[];
  property?: PropertySettings | null;
  onChanged: () => void;
}) {
  const { data, loading, error, reload } = useApi<TenantDetail>(open && tenantId ? `/api/tenants/${tenantId}` : null);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [busyNotice, setBusyNotice] = useState(false);

  const asRow: TenantRow | null = data
    ? {
        id: data.tenant.id,
        name: data.tenant.name,
        phone: data.tenant.phone,
        email: data.tenant.email,
        status: data.tenant.status,
        workplace: data.tenant.workplace,
        room: data.currentTenancy?.room ?? null,
        bed: data.currentTenancy?.bed ?? null,
        bedId: data.currentTenancy?.bedId ?? null,
        monthlyRent: data.currentTenancy?.monthlyRent ?? null,
        dueDay: data.currentTenancy?.dueDay ?? null,
        deposit: data.currentTenancy?.securityDeposit ?? null,
        joined: data.currentTenancy?.startDate ?? null,
        tenancyId: data.currentTenancy?.id ?? null,
        current: null,
      }
    : null;

  function refresh() {
    reload();
    onChanged();
  }

  async function toggleNotice() {
    if (!data || busyNotice) return;
    setBusyNotice(true);
    const onNotice = data.tenant.status === "NOTICE";
    try {
      await api(`/api/tenants/${data.tenant.id}`, {
        method: "PATCH",
        body: onNotice ? { clearNotice: true } : { noticeDate: todayIsoDate() },
      });
      toast.success(onNotice ? "Notice cleared — tenant is staying" : "Notice period started");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update notice");
    } finally {
      setBusyNotice(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="thin-scroll w-full overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border/60 px-5 py-4">
          {loading || !data ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          ) : (
            <div className="flex items-start gap-3 pr-6">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {initials(data.tenant.name)}
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate">{data.tenant.name}</SheetTitle>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {data.currentTenancy ? (
                    <span>Room {data.currentTenancy.room}-{data.currentTenancy.bed}</span>
                  ) : (
                    <span>No active bed</span>
                  )}
                  <StatusBadge status={data.tenant.status} />
                </div>
              </div>
            </div>
          )}
        </SheetHeader>

        {error ? (
          <EmptyState icon={UserRound} title="Could not load tenant" hint={error} className="py-12" />
        ) : !data ? (
          <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <div className="space-y-4 px-5 py-4">
            {/* quick actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setMarkPaidOpen(true)} disabled={!data.currentTenancy}>
                <ReceiptIndianRupee className="size-4" /> Mark rent paid
              </Button>
              {data.tenant.phone && (
                <>
                  <a
                    href={telLink(data.tenant.phone)}
                    className="flex size-9 items-center justify-center rounded-lg border border-border/60 transition-colors hover:bg-muted"
                    aria-label="Call tenant"
                  >
                    <Phone className="size-4" />
                  </a>
                  <a
                    href={waLink(data.tenant.phone, RENT_REMINDER(data.tenant.name, data.outstanding, new Date().toISOString().slice(0, 7)))}
                    target="_blank"
                    rel="noreferrer"
                    className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
                    aria-label="WhatsApp tenant"
                  >
                    <MessageCircle className="size-4" />
                  </a>
                </>
              )}
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5">
                    <MoreHorizontal className="size-4" /> More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Tenant actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setTransferOpen(true)} disabled={!data.currentTenancy}>
                    <ArrowRightLeft className="size-4" /> Transfer bed
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={toggleNotice} disabled={busyNotice}>
                    {data.tenant.status === "NOTICE" ? <BellOff className="size-4" /> : <BellRing className="size-4" />}
                    {data.tenant.status === "NOTICE" ? "Clear notice" : "Give notice"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBackfillOpen(true)} disabled={!data.currentTenancy}>
                    <Upload className="size-4" /> Backfill payments
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setCheckoutOpen(true)} disabled={!data.currentTenancy} className="text-rose-600 focus:text-rose-600 dark:text-rose-400">
                    <CalendarCheck className="size-4" /> Check out…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* summary strip */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Monthly rent", value: fmtINR(data.currentTenancy?.monthlyRent) },
                { label: "Outstanding", value: fmtINR(data.outstanding), tone: data.outstanding > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400" },
                { label: "Lifetime paid", value: fmtINR(data.totalPaid) },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn("mt-0.5 text-sm font-semibold tabular-nums", s.tone)}>{s.value}</p>
                </div>
              ))}
            </div>

            <Tabs defaultValue="profile">
              <TabsList className="w-full">
                <TabsTrigger value="profile" className="flex-1">Profile</TabsTrigger>
                <TabsTrigger value="ledger" className="flex-1">Ledger</TabsTrigger>
                <TabsTrigger value="payments" className="flex-1">Payments</TabsTrigger>
                <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="mt-4 space-y-1">
                <ProfileGrid data={data} />
              </TabsContent>

              <TabsContent value="ledger" className="mt-4">
                {data.invoices.length === 0 ? (
                  <EmptyState icon={ReceiptIndianRupee} title="No invoices yet" hint="Invoices appear once a tenancy starts." className="py-8" />
                ) : (
                  <div className="thin-scroll max-h-80 space-y-1.5 overflow-y-auto pr-1">
                    {data.invoices.map((inv) => (
                      <div key={inv.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{inv.period}</p>
                          <p className="text-xs text-muted-foreground">
                            Due {fmtDate(inv.dueDate)} · {inv.method ?? "—"}{inv.reference ? ` · ${inv.reference}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm"><Money value={inv.paid} /> <span className="text-muted-foreground">/ {fmtINR(inv.due)}</span></p>
                          <StatusBadge status={inv.status} className="mt-0.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payments" className="mt-4">
                {data.payments.length === 0 ? (
                  <EmptyState icon={ReceiptIndianRupee} title="No payments recorded" hint="Rent payments appear here with printable receipts." className="py-8" />
                ) : (
                  <div className="thin-scroll max-h-80 space-y-1.5 overflow-y-auto pr-1">
                    {data.payments.map((p) => (
                      <div key={p.id} className={cn("flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5", p.reversedAt && "opacity-60")}>
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-sm font-medium tabular-nums", p.reversedAt && "line-through")}>
                            {fmtINR(p.amount)} · {p.method}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {fmtDate(p.date)} · {p.receiptNumber}
                            {p.reversedAt ? " · reversed" : ""}
                          </p>
                        </div>
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
                              tenantName: data.tenant.name,
                              roomBed: data.currentTenancy ? `${data.currentTenancy.room}-${data.currentTenancy.bed}` : null,
                              notes: p.notes,
                            })
                          }
                        >
                          <Printer className="size-3.5" /> Receipt
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                {data.tenancies.length === 0 ? (
                  <EmptyState icon={UserRound} title="No tenancy history" className="py-8" />
                ) : (
                  <div className="thin-scroll max-h-80 space-y-1.5 overflow-y-auto pr-1">
                    {data.tenancies.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">Room {t.room}-{t.bed}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtDate(t.startDate)} → {t.endDate ? fmtDate(t.endDate) : "present"} · {fmtINR(t.monthlyRent)}/mo
                          </p>
                        </div>
                        <StatusBadge status={t.isActive ? "ACTIVE" : "CHECKED_OUT"} />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>

      {data && (
        <>
          <MarkPaidDialog
            open={markPaidOpen}
            onClose={() => setMarkPaidOpen(false)}
            tenant={{ id: data.tenant.id, name: data.tenant.name }}
            onDone={refresh}
          />
          <TransferDialog open={transferOpen} onClose={() => setTransferOpen(false)} tenant={asRow} rooms={rooms} onDone={refresh} />
          <CheckoutDialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} detail={data} onDone={refresh} />
          <BackfillDialog open={backfillOpen} onClose={() => setBackfillOpen(false)} detail={data} onDone={refresh} />
          <TenantFormDialog
            open={editOpen}
            onClose={() => setEditOpen(false)}
            rooms={rooms}
            tenant={asRow}
            onSaved={refresh}
          />
          <ReceiptPrintDialog open={!!receipt} onClose={() => setReceipt(null)} receipt={receipt} property={property} />
        </>
      )}
    </Sheet>
  );
}

function ProfileGrid({ data }: { data: TenantDetail }) {
  const t = data.tenant;
  const ct = data.currentTenancy;
  const rows: { label: string; value: string }[] = [
    { label: "Phone", value: t.phone ?? "—" },
    { label: "Email", value: t.email ?? "—" },
    { label: "Workplace", value: t.workplace ?? "—" },
    { label: "ID", value: t.idType ? `${t.idType.replace("_", " ")}${t.idNumber ? ` · ${t.idNumber}` : ""}` : t.idNumber ?? "—" },
    { label: "Emergency contact", value: t.emergencyContact ?? "—" },
    { label: "Joined", value: ct ? fmtDate(ct.startDate) : "—" },
    { label: "Monthly rent", value: ct ? fmtINR(ct.monthlyRent) : "—" },
    { label: "Security deposit", value: ct ? fmtINR(ct.securityDeposit) : "—" },
    { label: "Rent due day", value: ct ? String(ct.dueDay) : "—" },
    { label: "Notice date", value: ct?.noticeDate ? fmtDate(ct.noticeDate) : "—" },
    { label: "Added on", value: fmtDate(t.createdAt) },
  ];
  return (
    <div>
      <Separator className="mb-3" />
      <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-2 sm:border-0 sm:pb-0">
            <dt className="text-xs text-muted-foreground">{r.label}</dt>
            <dd className="truncate text-sm font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
      {t.notes && (
        <div className="mt-4 rounded-lg border border-border/60 bg-muted/30 p-3">
          <SectionLabel>Notes</SectionLabel>
          <p className="mt-1 text-sm">{t.notes}</p>
        </div>
      )}
    </div>
  );
}
