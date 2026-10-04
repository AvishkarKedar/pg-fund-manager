"use client";

import { useEffect, useState } from "react";
import {
  ArrowRightLeft, BadgeCheck, BellOff, BellRing, CalendarCheck, Download, Megaphone, MoreHorizontal,
  MessageCircle, Phone, Search, Upload, UserPlus, Users,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { api, useApi, useDebounced, useSignalReload } from "@/hooks/pg/useApi";
import type { PropertySettings, RoomCard, TenantDetail, TenantRow, TenantsResponse } from "@/lib/client";
import { fmtDate, fmtINR, initials, RENT_REMINDER, telLink, todayIsoDate, todayYm, waLink } from "@/lib/client";
import { EmptyState, ErrorState, Money, PageHeader, StatusBadge } from "@/components/pg/bits";
import { BackfillDialog, CheckoutDialog, TenantFormDialog, TransferDialog } from "@/components/pg/tenant-dialogs";
import { TenantDetailSheet } from "@/components/pg/tenant-detail";
import { BroadcastSheet } from "@/components/pg/broadcast-sheet";

type ActionMode = "checkout" | "backfill";

const ordSuffix = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
};

export function TenantsView({
  refreshSignal,
  focusTenantId,
  onClearFocus,
  property,
}: {
  refreshSignal: number;
  focusTenantId: string | null;
  onClearFocus: () => void;
  property?: PropertySettings | null;
}) {
  const [month] = useState(todayYm());
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 350);
  const [status, setStatus] = useState("ALL");
  const list = useApi<TenantsResponse>(
    `/api/tenants?q=${encodeURIComponent(q)}&status=${status === "ALL" ? "" : status}&month=${month}`
  );
  const rooms = useApi<{ rooms: RoomCard[] }>("/api/rooms");
  useSignalReload(refreshSignal, list.reload);
  useSignalReload(refreshSignal, rooms.reload);

  const [sheetTenantId, setSheetTenantId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [editRow, setEditRow] = useState<TenantRow | null>(null);
  const [transferRow, setTransferRow] = useState<TenantRow | null>(null);
  const [action, setAction] = useState<{ id: string; mode: ActionMode } | null>(null);
  const [noticeBusy, setNoticeBusy] = useState<string | null>(null);

  // deep link from other views (e.g. Rooms)
  useEffect(() => {
    if (focusTenantId) {
      setSheetTenantId(focusTenantId);
      onClearFocus();
    }
  }, [focusTenantId]);

  const actionDetail = useApi<TenantDetail>(action ? `/api/tenants/${action.id}` : null);

  async function toggleNotice(row: TenantRow) {
    if (noticeBusy) return;
    setNoticeBusy(row.id);
    const onNotice = row.status === "NOTICE";
    try {
      await api(`/api/tenants/${row.id}`, {
        method: "PATCH",
        body: onNotice ? { clearNotice: true } : { noticeDate: todayIsoDate() },
      });
      toast.success(onNotice ? "Notice cleared" : "Notice period started", { description: row.name });
      list.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update notice");
    } finally {
      setNoticeBusy(null);
    }
  }

  const tenants = list.data?.tenants ?? [];

  return (
    <div>
      <PageHeader
        title="Tenants"
        subtitle={`${tenants.length} ${tenants.length === 1 ? "profile" : "profiles"}${q ? ` matching “${search}”` : ""}`}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => (window.location.href = `/api/reports/export?type=tenants&month=${month}`)}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setBroadcastOpen(true)}>
              <Megaphone className="size-4" /> Broadcast
            </Button>
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                setEditRow(null);
                setFormOpen(true);
              }}
            >
              <UserPlus className="size-4" /> Add tenant
            </Button>
          </>
        }
      />

      {/* toolbar */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone or room…"
            className="h-10 pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search tenants"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-10 w-full sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["ALL", "ACTIVE", "NOTICE", "CHECKED_OUT"].map((s) => (
              <SelectItem key={s} value={s}>
                {s === "ALL" ? "All statuses" : s === "CHECKED_OUT" ? "Checked out" : s.charAt(0) + s.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {list.loading && !list.data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : tenants.length === 0 ? (
        <Card className="rounded-xl border-border/60 shadow-sm">
          <EmptyState
            icon={Users}
            title={q || status !== "ALL" ? "No tenants match your filters" : "No tenants yet"}
            hint={q || status !== "ALL" ? "Try clearing the search or status filter." : "Add your first tenant or import your Excel sheet."}
            action={
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setFormOpen(true)}>
                <UserPlus className="size-4" /> Add tenant
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* desktop table */}
          <Card className="hidden rounded-xl border-border/60 shadow-sm md:block">
            <div className="thin-scroll overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead className="text-right">Rent</TableHead>
                    <TableHead className="text-right">Deposit</TableHead>
                    <TableHead className="text-center">Rent due on</TableHead>
                    <TableHead>This month</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((t) => (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer odd:bg-muted/30 hover:bg-muted/50 hover:odd:bg-muted/50 [&_td]:py-3.5"
                      onClick={() => setSheetTenantId(t.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-9">
                            <AvatarFallback className="bg-emerald-500/15 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              {initials(t.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium" title={t.name}>{t.name}</p>
                            <p className="truncate text-xs tabular-nums text-muted-foreground" title={t.phone ?? undefined}>
                              {t.phone ?? "—"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {t.room ? (
                          <span className="whitespace-nowrap">{t.room}<span className="text-muted-foreground">-{t.bed}</span></span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right"><Money value={t.monthlyRent} /></TableCell>
                      <TableCell className="text-right"><Money value={t.deposit} muted /></TableCell>
                      <TableCell className="text-center tabular-nums text-muted-foreground">{t.dueDay ? `${t.dueDay}${ordSuffix(t.dueDay)}` : "—"}</TableCell>
                      <TableCell>
                        {t.current ? (
                          <div className="flex items-center gap-2">
                            <StatusBadge status={t.current.status} />
                            {t.current.outstanding > 0 && (
                              <Money value={t.current.outstanding} className="text-xs text-rose-600 dark:text-rose-400" />
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(t.joined)}</TableCell>
                      <TableCell>
                        <RowActions
                          row={t}
                          onView={() => setSheetTenantId(t.id)}
                          onEdit={() => {
                            setEditRow(t);
                            setFormOpen(true);
                          }}
                          onTransfer={() => setTransferRow(t)}
                          onNotice={() => toggleNotice(t)}
                          onCheckout={() => setAction({ id: t.id, mode: "checkout" })}
                          onBackfill={() => setAction({ id: t.id, mode: "backfill" })}
                          noticeBusy={noticeBusy === t.id}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* mobile cards */}
          <div className="space-y-2.5 md:hidden">
            {tenants.map((t) => (
              <Card key={t.id} className="rounded-xl border-border/60 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-emerald-500/15 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {initials(t.name)}
                      </AvatarFallback>
                    </Avatar>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setSheetTenantId(t.id)}>
                      <p className="truncate font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.room ? `Room ${t.room}-${t.bed} · ` : ""}
                        {t.monthlyRent != null ? `${fmtINR(t.monthlyRent)}/mo` : "No bed"}
                      </p>
                    </button>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="text-xs">
                      {t.current ? (
                        <span className="flex items-center gap-1.5">
                          <StatusBadge status={t.current.status} />
                          {t.current.outstanding > 0 && (
                            <Money value={t.current.outstanding} className="text-rose-600 dark:text-rose-400" />
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No invoice</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {t.phone && (
                        <>
                          <a href={telLink(t.phone)} className="flex size-9 items-center justify-center rounded-lg border border-border/60 hover:bg-muted" aria-label="Call">
                            <Phone className="size-4" />
                          </a>
                          {(t.current?.outstanding ?? 0) > 0 ? (
                            <a
                              href={waLink(t.phone, RENT_REMINDER(t.name, t.current?.outstanding ?? 0, month))}
                              target="_blank"
                              rel="noreferrer"
                              className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              aria-label="Send rent reminder on WhatsApp"
                            >
                              <MessageCircle className="size-4" />
                            </a>
                          ) : (
                            <span
                              className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              title="Nothing pending — all paid up"
                            >
                              <BadgeCheck className="size-4" />
                            </span>
                          )}
                        </>
                      )}
                      <RowActions
                        row={t}
                        onView={() => setSheetTenantId(t.id)}
                        onEdit={() => {
                          setEditRow(t);
                          setFormOpen(true);
                        }}
                        onTransfer={() => setTransferRow(t)}
                        onNotice={() => toggleNotice(t)}
                        onCheckout={() => setAction({ id: t.id, mode: "checkout" })}
                        onBackfill={() => setAction({ id: t.id, mode: "backfill" })}
                        noticeBusy={noticeBusy === t.id}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* dialogs */}
      <BroadcastSheet open={broadcastOpen} onOpenChange={setBroadcastOpen} />
      <TenantDetailSheet
        open={!!sheetTenantId}
        onClose={() => setSheetTenantId(null)}
        tenantId={sheetTenantId}
        rooms={rooms.data?.rooms ?? []}
        property={property}
        onChanged={list.reload}
      />
      <TenantFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditRow(null);
        }}
        rooms={rooms.data?.rooms ?? []}
        tenant={editRow}
        onSaved={list.reload}
      />
      <TransferDialog
        open={!!transferRow}
        onClose={() => setTransferRow(null)}
        tenant={transferRow}
        rooms={rooms.data?.rooms ?? []}
        onDone={list.reload}
      />
      {action?.mode === "checkout" && actionDetail.data && (
        <CheckoutDialog
          open
          onClose={() => setAction(null)}
          detail={actionDetail.data}
          onDone={() => {
            list.reload();
            setSheetTenantId(null);
          }}
        />
      )}
      {action?.mode === "backfill" && actionDetail.data && (
        <BackfillDialog open onClose={() => setAction(null)} detail={actionDetail.data} onDone={list.reload} />
      )}
    </div>
  );
}

function RowActions({
  row,
  onView,
  onEdit,
  onTransfer,
  onNotice,
  onCheckout,
  onBackfill,
  noticeBusy,
}: {
  row: TenantRow;
  onView: () => void;
  onEdit: () => void;
  onTransfer: () => void;
  onNotice: () => void;
  onCheckout: () => void;
  onBackfill: () => void;
  noticeBusy: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Actions for ${row.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>{row.name}</DropdownMenuLabel>
        <DropdownMenuItem onClick={onView}><Users className="size-4" /> View profile</DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}><UserPlus className="size-4" /> Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={onTransfer} disabled={!row.tenancyId}>
          <ArrowRightLeft className="size-4" /> Transfer bed
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onNotice} disabled={noticeBusy}>
          {row.status === "NOTICE" ? <BellOff className="size-4" /> : <BellRing className="size-4" />}
          {row.status === "NOTICE" ? "Clear notice" : "Give notice"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onBackfill} disabled={!row.tenancyId}>
          <Upload className="size-4" /> Backfill payments
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCheckout} disabled={!row.tenancyId} className="text-rose-600 focus:text-rose-600 dark:text-rose-400">
          <CalendarCheck className="size-4" /> Check out…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
