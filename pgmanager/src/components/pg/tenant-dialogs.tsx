"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, CalendarCheck, Loader2, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/hooks/pg/useApi";
import type { RoomCard, TenantDetail, TenantRow } from "@/lib/client";
import { fmtINR, lastNMonths, monthLabel, todayIsoDate } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Money, SectionLabel } from "@/components/pg/bits";

const ID_TYPES = ["AADHAAR", "PAN", "DRIVING_LICENSE", "PASSPORT", "EMPLOYEE_ID", "OTHER"];

/* ---------------- add / edit tenant ---------------- */
export function TenantFormDialog({
  open,
  onClose,
  rooms,
  tenant,
  presetBedId,
  defaultDueDay = 5,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  rooms: RoomCard[];
  tenant?: TenantRow | null;
  presetBedId?: string | null;
  defaultDueDay?: number;
  onSaved: () => void;
}) {
  const editing = !!tenant;
  const [form, setForm] = useState({
    name: "", phone: "", email: "", idType: "", idNumber: "", emergencyContact: "",
    workplace: "", notes: "", bedId: "", monthlyRent: "", securityDeposit: "", dueDay: String(defaultDueDay),
    startDate: todayIsoDate(),
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const presetRoom = rooms.find((r) => r.beds.some((b) => b.id === presetBedId));
    setForm({
      name: tenant?.name ?? "",
      phone: tenant?.phone ?? "",
      email: tenant?.email ?? "",
      idType: "", // not exposed on list rows; kept blank to avoid overwriting
      idNumber: "",
      emergencyContact: "",
      workplace: tenant?.workplace ?? "",
      notes: "",
      bedId: tenant?.bedId ?? (presetBedId ?? ""),
      monthlyRent: tenant?.monthlyRent != null ? String(tenant.monthlyRent) : presetRoom ? String(presetRoom.defaultRent) : "",
      securityDeposit: tenant?.deposit != null ? String(tenant.deposit) : presetRoom ? String(presetRoom.defaultRent) : "",
      dueDay: tenant?.dueDay != null ? String(tenant.dueDay) : String(defaultDueDay),
      startDate: tenant?.joined ? tenant.joined.slice(0, 10) : todayIsoDate(),
    });
  }, [open, tenant]);

  function onBedChange(bedId: string) {
    const room = rooms.find((r) => r.beds.some((b) => b.id === bedId));
    const bed = room?.beds.find((b) => b.id === bedId);
    setForm((f) => ({
      ...f,
      bedId,
      monthlyRent: bed && room ? String(room.defaultRent) : f.monthlyRent,
      securityDeposit: f.securityDeposit || (room ? String(room.defaultRent) : ""),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!form.name.trim()) {
      toast.error("Tenant name is required");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        idType: form.idType || null,
        idNumber: form.idNumber.trim() || null,
        emergencyContact: form.emergencyContact.trim() || null,
        workplace: form.workplace.trim() || null,
        notes: form.notes.trim() || null,
        monthlyRent: form.monthlyRent ? Number(form.monthlyRent) : undefined,
        dueDay: Number(form.dueDay),
      };
      if (editing) {
        await api(`/api/tenants/${tenant!.id}`, { method: "PATCH", body: payload });
        toast.success(`${form.name} updated`);
      } else {
        await api("/api/tenants", {
          body: {
            ...payload,
            bedId: form.bedId || undefined,
            securityDeposit: form.securityDeposit ? Number(form.securityDeposit) : 0,
            startDate: form.startDate,
          },
        });
        toast.success(`${form.name} added`, {
          description: form.bedId ? "Tenancy started — this month's invoice is ready." : "Saved without a bed — assign one from Rooms.",
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save tenant");
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="thin-scroll max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing ? <UserPlus className="size-5" /> : <UserPlus className="size-5 text-emerald-600 dark:text-emerald-400" />}
            {editing ? `Edit ${tenant?.name}` : "Add tenant"}
          </DialogTitle>
          <DialogDescription>
            {editing ? "Update profile and rent terms" : "Full profile — only the name is mandatory"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={set("name")} placeholder="e.g. Aarav Kulkarni" required />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={set("phone")} placeholder="+91 98765 43210" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={set("email")} placeholder="optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Workplace</Label>
              <Input value={form.workplace} onChange={set("workplace")} placeholder="e.g. Infosys" />
            </div>
            <div className="space-y-1.5">
              <Label>ID type</Label>
              <Select value={form.idType} onValueChange={(v) => setForm((f) => ({ ...f, idType: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {ID_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ID number</Label>
              <Input value={form.idNumber} onChange={set("idNumber")} placeholder="optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Emergency contact</Label>
              <Input value={form.emergencyContact} onChange={set("emergencyContact")} placeholder="phone or name" />
            </div>
            <div className="space-y-1.5">
              <Label>Bed</Label>
              <Select value={form.bedId} onValueChange={onBedChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={editing ? (tenant?.room ? `Room ${tenant.room}-${tenant.bed} (current)` : "No bed") : "Choose a vacant bed"} />
                </SelectTrigger>
                <SelectContent>
                  {editing && tenant?.bedId && (
                    <SelectItem value={tenant.bedId}>
                      Room {tenant.room}-{tenant.bed} (current)
                    </SelectItem>
                  )}
                  {rooms.map((room) => {
                    const vacant = room.beds.filter((b) => b.status === "VACANT" && b.id !== tenant?.bedId);
                    if (vacant.length === 0) return null;
                    return (
                      <SelectGroup key={room.id}>
                        <SelectLabel>Room {room.number} · {fmtINR(room.defaultRent)}</SelectLabel>
                        {vacant.map((b) => (
                          <SelectItem key={b.id} value={b.id}>Bed {b.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Monthly rent (₹)</Label>
              <Input type="number" min="0" value={form.monthlyRent} onChange={set("monthlyRent")} placeholder="6500" />
            </div>
            <div className="space-y-1.5">
              <Label>Security deposit (₹)</Label>
              <Input type="number" min="0" value={form.securityDeposit} onChange={set("securityDeposit")} placeholder="6500" />
            </div>
            <div className="space-y-1.5">
              <Label>Due day (1–28)</Label>
              <Input type="number" min="1" max="28" value={form.dueDay} onChange={set("dueDay")} />
            </div>
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" value={form.startDate} onChange={set("startDate")} disabled={editing} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={set("notes")} placeholder="Preferences, meal plan, anything worth remembering" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Add tenant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- transfer bed ---------------- */
export function TransferDialog({
  open,
  onClose,
  tenant,
  rooms,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  tenant: TenantRow | null;
  rooms: RoomCard[];
  onDone: () => void;
}) {
  const [bedId, setBedId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setBedId("");
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant || !bedId || busy) return;
    setBusy(true);
    try {
      await api(`/api/tenants/${tenant.id}`, { method: "PATCH", body: { transferToBedId: bedId } });
      toast.success(`${tenant.name} transferred`, { description: "Payment history is preserved on the tenant profile." });
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="size-5" /> Transfer bed
          </DialogTitle>
          <DialogDescription>
            {tenant ? `${tenant.name} currently in Room ${tenant.room}-${tenant.bed}. Rent & deposit stay attached to the tenant.` : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Move to vacant bed</Label>
            <Select value={bedId} onValueChange={setBedId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a bed" /></SelectTrigger>
              <SelectContent>
                {rooms.map((room) => {
                  const vacant = room.beds.filter((b) => b.status === "VACANT");
                  if (vacant.length === 0) return null;
                  return (
                    <SelectGroup key={room.id}>
                      <SelectLabel>Room {room.number}</SelectLabel>
                      {vacant.map((b) => (
                        <SelectItem key={b.id} value={b.id}>Bed {b.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!bedId || busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Transfer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- check out ---------------- */
export function CheckoutDialog({
  open,
  onClose,
  detail,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  detail: TenantDetail | null;
  onDone: () => void;
}) {
  const [endDate, setEndDate] = useState(todayIsoDate());
  const [deductions, setDeductions] = useState("0");
  const [busy, setBusy] = useState(false);

  const deposit = detail?.currentTenancy?.securityDeposit ?? 0;
  const outstanding = detail?.outstanding ?? 0;
  const deduct = Number(deductions) || 0;
  const refund = Math.max(0, deposit - deduct - outstanding);

  useEffect(() => {
    if (open) {
      setEndDate(todayIsoDate());
      setDeductions("0");
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!detail || busy) return;
    setBusy(true);
    try {
      const res = await api<{ settlement: { depositReturned: number; outstanding: number }; room: string }>(
        `/api/tenants/${detail.tenant.id}/checkout`,
        { body: { endDate, deductions: deduct } }
      );
      toast.success(`${detail.tenant.name} checked out`, {
        description: `Room ${res.room} · refund ${fmtINR(res.settlement.depositReturned)} after ${fmtINR(res.settlement.outstanding)} dues`,
      });
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-out failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="size-5" /> Check out tenant
          </DialogTitle>
          <DialogDescription>
            {detail ? `${detail.tenant.name} · Room ${detail.currentTenancy?.room}-${detail.currentTenancy?.bed}` : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Move-out date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Deductions (₹)</Label>
              <Input type="number" min="0" value={deductions} onChange={(e) => setDeductions(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/40 p-4 text-sm">
            <SectionLabel>Settlement preview</SectionLabel>
            <div className="flex justify-between"><span className="text-muted-foreground">Security deposit</span><Money value={deposit} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">− Outstanding dues</span><Money value={outstanding} className="text-rose-600 dark:text-rose-400" /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">− Deductions</span><Money value={deduct} /></div>
            <div className="flex justify-between border-t border-border/60 pt-2 font-semibold">
              <span>Refund to tenant</span>
              <Money value={refund} className={refund > 0 ? "text-emerald-600 dark:text-emerald-400" : ""} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-rose-600 hover:bg-rose-700">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Confirm check-out
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- backfill payments ---------------- */
export function BackfillDialog({
  open,
  onClose,
  detail,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  detail: TenantDetail | null;
  onDone: () => void;
}) {
  const months = lastNMonths(12);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  const settledPeriods = new Set(
    (detail?.invoices ?? []).filter((i) => i.due - i.paid <= 0).map((i) => i.period)
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!detail?.currentTenancy || selected.length === 0 || busy) return;
    setBusy(true);
    try {
      const res = await api<{ created: { period: string }[] }>("/api/rent/backfill", {
        body: { tenancyId: detail.currentTenancy.id, periods: selected },
      });
      toast.success(`${res.created.length} payment${res.created.length === 1 ? "" : "s"} backfilled`, {
        description: selected.map((m) => monthLabel(m)).join(", "),
      });
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backfill failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-5" /> Backfill payments
          </DialogTitle>
          <DialogDescription>
            {detail ? `Mark past months as fully paid for ${detail.tenant.name}` : ""} — useful when history was never digitised.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {months.map((m) => {
              const active = selected.includes(m);
              const already = settledPeriods.has(m);
              return (
                <button
                  type="button"
                  key={m}
                  disabled={already}
                  onClick={() => setSelected((s) => (active ? s.filter((x) => x !== m) : [...s, m]))}
                  className={cn(
                    "min-h-9 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : already
                        ? "cursor-not-allowed border-border/60 bg-muted text-muted-foreground/50 line-through"
                        : "border-border/60 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {monthLabel(m)}
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selected.length} month{selected.length === 1 ? "" : "s"} · {fmtINR((detail?.currentTenancy?.monthlyRent ?? 0) * selected.length)} total
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={selected.length === 0 || busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Backfill {selected.length || ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
