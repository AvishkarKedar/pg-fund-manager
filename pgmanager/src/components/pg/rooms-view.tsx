"use client";

import { useEffect, useState } from "react";
import {
  BedDouble, DoorClosed, Loader2, MessageCircle, Minus, MoreHorizontal, Pencil,
  Phone, Plus, ReceiptIndianRupee, Trash2, UserRound, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { api, useApi, useSignalReload } from "@/hooks/pg/useApi";
import type { BedTile, RoomCard, RoomsResponse } from "@/lib/client";
import { fmtDate, RENT_REMINDER, telLink, waLink } from "@/lib/client";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, Money, PageHeader, SectionLabel, StatusBadge } from "@/components/pg/bits";
import { MarkPaidDialog } from "@/components/pg/mark-paid-dialog";
import { TenantFormDialog } from "@/components/pg/tenant-dialogs";

export function RoomsView({
  refreshSignal,
  onTenantFocus,
}: {
  refreshSignal: number;
  onTenantFocus: (tenantId: string) => void;
}) {
  const { data, error, loading, reload } = useApi<RoomsResponse>("/api/rooms");
  useSignalReload(refreshSignal, reload);
  const [roomFormOpen, setRoomFormOpen] = useState(false);
  const [editRoom, setEditRoom] = useState<RoomCard | null>(null);
  const [deleteRoom, setDeleteRoom] = useState<RoomCard | null>(null);
  const [addTenantBed, setAddTenantBed] = useState<{ bedId: string; roomNumber: string; bedLabel: string } | null>(null);
  const [quickBed, setQuickBed] = useState<{ room: RoomCard; bed: BedTile } | null>(null);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const rooms = data?.rooms ?? [];
  const floors = Array.from(new Set(rooms.map((r) => r.floor))).sort((a, b) => a - b);
  const totalBeds = rooms.reduce((s, r) => s + r.beds.length, 0);
  const occupied = rooms.reduce((s, r) => s + r.occupiedCount, 0);

  async function confirmDelete() {
    if (!deleteRoom || deleting) return;
    setDeleting(true);
    try {
      await api(`/api/rooms/${deleteRoom.id}`, { method: "DELETE" });
      toast.success(`Room ${deleteRoom.number} deleted`);
      setDeleteRoom(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete room");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Rooms & beds"
        subtitle={`${rooms.length} rooms · ${occupied}/${totalBeds} beds occupied`}
        actions={
          <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditRoom(null); setRoomFormOpen(true); }}>
            <Plus className="size-4" /> Add room
          </Button>
        }
      />

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 w-full rounded-xl" />)}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rooms.length === 0 ? (
        <Card className="rounded-xl border-border/60 shadow-sm">
          <EmptyState
            icon={BedDouble}
            title="No rooms yet"
            hint="Create your first room with beds — tenants are assigned to beds."
            action={
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setRoomFormOpen(true)}>
                <Plus className="size-4" /> Add room
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {floors.map((floor) => (
            <section key={floor} aria-label={`Floor ${floor}`}>
              <SectionLabel className="mb-3">Floor {floor}</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rooms.filter((r) => r.floor === floor).map((room) => (
                  <RoomCardView
                    key={room.id}
                    room={room}
                    onEdit={() => { setEditRoom(room); setRoomFormOpen(true); }}
                    onDelete={() => setDeleteRoom(room)}
                    onVacantClick={(bed) => setAddTenantBed({ bedId: bed.id, roomNumber: room.number, bedLabel: bed.label })}
                    onOccupiedClick={(bed) => setQuickBed({ room, bed })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* dialogs */}
      <RoomFormDialog
        open={roomFormOpen}
        onClose={() => { setRoomFormOpen(false); setEditRoom(null); }}
        room={editRoom}
        onSaved={reload}
      />
      <TenantFormDialog
        open={!!addTenantBed}
        onClose={() => setAddTenantBed(null)}
        rooms={rooms}
        presetBedId={addTenantBed?.bedId}
        onSaved={reload}
      />
      <QuickTenantDialog
        data={quickBed}
        onClose={() => setQuickBed(null)}
        onMarkPaid={() => setMarkPaidOpen(true)}
        onViewProfile={() => {
          if (quickBed?.bed.tenant) onTenantFocus(quickBed.bed.tenant.id);
          setQuickBed(null);
        }}
      />
      <MarkPaidDialog
        open={markPaidOpen}
        onClose={() => setMarkPaidOpen(false)}
        tenant={quickBed?.bed.tenant ? { id: quickBed.bed.tenant.id, name: quickBed.bed.tenant.name } : null}
        onDone={reload}
      />
      <AlertDialog open={!!deleteRoom} onOpenChange={(v) => !v && setDeleteRoom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete room {deleteRoom?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the room and its {deleteRoom?.beds.length ?? 0} bed{deleteRoom?.beds.length === 1 ? "" : "s"}. Past payments and
              invoices are preserved. Rooms with occupied beds cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />} Delete room
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RoomCardView({
  room,
  onEdit,
  onDelete,
  onVacantClick,
  onOccupiedClick,
}: {
  room: RoomCard;
  onEdit: () => void;
  onDelete: () => void;
  onVacantClick: (bed: BedTile) => void;
  onOccupiedClick: (bed: BedTile) => void;
}) {
  return (
    <Card className="rounded-xl border-border/60 shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <p className="text-base font-semibold">Room {room.number}</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {room.roomType}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Money value={room.defaultRent} className="text-sm text-muted-foreground" />
            <span className="text-xs tabular-nums text-muted-foreground">
              {room.occupiedCount}/{room.beds.length}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Room ${room.number} actions`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}><Pencil className="size-4" /> Edit room</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-rose-600 focus:text-rose-600 dark:text-rose-400">
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {room.notes && <p className="mt-1 truncate text-xs text-muted-foreground">{room.notes}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {room.beds.map((bed) => {
            if (bed.status === "VACANT" || !bed.tenant) {
              return (
                <button
                  key={bed.id}
                  onClick={() => onVacantClick(bed)}
                  className="group flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-2 text-center transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5"
                  aria-label={`Bed ${bed.label} is vacant — add tenant`}
                >
                  <span className="text-xs font-medium text-muted-foreground">Bed {bed.label}</span>
                  <span className="hidden text-[11px] text-emerald-600 opacity-0 transition-opacity group-hover:opacity-100 sm:block dark:text-emerald-400">
                    + Add tenant
                  </span>
                  <Plus className="size-4 text-emerald-600 opacity-60 transition-opacity group-hover:opacity-100 dark:text-emerald-400 sm:hidden" />
                </button>
              );
            }
            const onNotice = bed.status === "NOTICE";
            return (
              <button
                key={bed.id}
                onClick={() => onOccupiedClick(bed)}
                className={cn(
                  "flex min-h-20 flex-col justify-center rounded-lg border p-2 text-left transition-colors hover:bg-muted/60",
                  onNotice
                    ? "border-amber-500/50 ring-1 ring-amber-500/20"
                    : "border-border/60 bg-muted/20"
                )}
                aria-label={`Bed ${bed.label}: ${bed.tenant.name}`}
              >
                <div className="flex w-full items-center gap-1">
                  <span className={cn("size-1.5 shrink-0 rounded-full", onNotice ? "bg-amber-500" : "bg-emerald-500")} />
                  <span className="truncate text-xs font-medium">{bed.tenant.name}</span>
                </div>
                <div className="mt-0.5 flex w-full items-center justify-between gap-1">
                  <span className="text-[11px] text-muted-foreground">Bed {bed.label}</span>
                  <Money value={bed.tenant.monthlyRent} className="text-[11px] text-muted-foreground" />
                </div>
                {onNotice && (
                  <span className="mt-1 inline-flex w-fit items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                    Leaving
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- add / edit room ---------------- */
function RoomFormDialog({
  open,
  onClose,
  room,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  room: RoomCard | null;
  onSaved: () => void;
}) {
  const editing = !!room;
  const [form, setForm] = useState({ number: "", floor: "1", bedCount: 2, defaultRent: "", roomType: "SHARED", notes: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (room) {
      setForm({
        number: room.number,
        floor: String(room.floor),
        bedCount: 0,
        defaultRent: String(room.defaultRent),
        roomType: room.roomType,
        notes: room.notes ?? "",
      });
    } else {
      setForm({ number: "", floor: "1", bedCount: 2, defaultRent: "", roomType: "SHARED", notes: "" });
    }
  }, [open, room]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!form.number.trim()) {
      toast.error("Room number is required");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await api(`/api/rooms/${room!.id}`, {
          method: "PATCH",
          body: {
            number: form.number.trim(),
            floor: Number(form.floor),
            defaultRent: Number(form.defaultRent || 0),
            roomType: form.roomType,
            notes: form.notes.trim() || null,
            addBeds: form.bedCount,
          },
        });
        toast.success(`Room ${form.number} updated`);
      } else {
        await api("/api/rooms", {
          body: {
            number: form.number.trim(),
            floor: Number(form.floor),
            bedCount: form.bedCount,
            defaultRent: Number(form.defaultRent || 0),
            roomType: form.roomType,
            notes: form.notes.trim() || null,
          },
        });
        toast.success(`Room ${form.number} created`, { description: `${form.bedCount} bed${form.bedCount === 1 ? "" : "s"} added` });
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save room");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DoorClosed className="size-5" /> {editing ? `Edit room ${room?.number}` : "Add room"}
          </DialogTitle>
          <DialogDescription>
            {editing ? "Update details or add more beds" : "Beds are labelled A, B, C… automatically"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Room number *</Label>
              <Input value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} placeholder="e.g. 104" required />
            </div>
            <div className="space-y-1.5">
              <Label>Floor</Label>
              <Select value={form.floor} onValueChange={(v) => setForm((f) => ({ ...f, floor: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>{i === 0 ? "Ground" : `Floor ${i}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{editing ? "Add beds" : "Bed count"}</Label>
              <Stepper
                value={form.bedCount}
                min={editing ? 0 : 1}
                max={8}
                onChange={(v) => setForm((f) => ({ ...f, bedCount: v }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.roomType} onValueChange={(v) => setForm((f) => ({ ...f, roomType: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SHARED">Shared</SelectItem>
                  <SelectItem value="PRIVATE">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Default rent (₹)</Label>
            <Input type="number" min="0" value={form.defaultRent} onChange={(e) => setForm((f) => ({ ...f, defaultRent: e.target.value }))} placeholder="6500" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="AC, balcony, attached bathroom…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Create room"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex h-10 items-center justify-between rounded-lg border border-input">
      <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Decrease" disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="size-4" />
      </Button>
      <span className="tabular-nums text-sm font-medium">{value}</span>
      <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Increase" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

/* ---------------- occupied bed quick dialog ---------------- */
function QuickTenantDialog({
  data,
  onClose,
  onMarkPaid,
  onViewProfile,
}: {
  data: { room: RoomCard; bed: BedTile } | null;
  onClose: () => void;
  onMarkPaid: () => void;
  onViewProfile: () => void;
}) {
  const t = data?.bed.tenant;
  return (
    <Dialog open={!!data && !!t} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {t && (
          <>
            <DialogHeader>
              <DialogTitle>{t.name}</DialogTitle>
              <DialogDescription>
                Room {data!.room.number}-{data!.bed.label} · <Money value={t.monthlyRent} />/mo · due day {t.dueDay}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Joined {fmtDate(t.startDate)}</p>
              <p>Tenant status: <StatusBadge status={t.status} /></p>
              {t.phone && <p className="tabular-nums">{t.phone}</p>}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button size="sm" className="h-10 bg-emerald-600 hover:bg-emerald-700" onClick={onMarkPaid}>
                <ReceiptIndianRupee className="size-4" /> Mark rent paid
              </Button>
              <Button size="sm" variant="outline" className="h-10" onClick={onViewProfile}>
                <UserRound className="size-4" /> View profile
              </Button>
              {t.phone && (
                <>
                  <a
                    href={telLink(t.phone)}
                    className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border/60 text-sm transition-colors hover:bg-muted"
                  >
                    <Phone className="size-4" /> Call
                  </a>
                  <a
                    href={waLink(t.phone, RENT_REMINDER(t.name, t.monthlyRent, new Date().toISOString().slice(0, 7)))}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 text-sm text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
                  >
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
