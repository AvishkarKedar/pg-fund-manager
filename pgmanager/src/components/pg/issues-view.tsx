"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Clock, Loader2, Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { api, useApi, useSignalReload } from "@/hooks/pg/useApi";
import type { ComplaintRow, ComplaintsResponse, RoomCard, RoomsResponse } from "@/lib/client";
import { fmtINR, monthLabel } from "@/lib/client";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, Money, PageHeader, StatusBadge } from "@/components/pg/bits";

const FILTERS = [
  { key: "", label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "RESOLVED", label: "Resolved" },
] as const;

export function IssuesView({ refreshSignal }: { refreshSignal: number }) {
  const [status, setStatus] = useState("");
  const { data, error, loading, reload } = useApi<ComplaintsResponse>(`/api/complaints${status ? `?status=${status}` : ""}`);
  const rooms = useApi<RoomsResponse>("/api/rooms");
  useSignalReload(refreshSignal, reload);

  const [logOpen, setLogOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<ComplaintRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const total = data ? data.counts.OPEN + data.counts.IN_PROGRESS + data.counts.RESOLVED : 0;

  async function setStatusFor(row: ComplaintRow, next: string) {
    if (busyId) return;
    setBusyId(row.id);
    try {
      await api(`/api/complaints/${row.id}`, { method: "PATCH", body: { status: next } });
      toast.success(next === "RESOLVED" ? `"${row.title}" resolved` : next === "IN_PROGRESS" ? "Marked in progress" : "Reopened");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update issue");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Issues"
        subtitle={data ? `${data.counts.OPEN} open · ${data.counts.IN_PROGRESS} in progress · ${data.counts.RESOLVED} resolved` : "Complaints & repairs"}
        actions={
          <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setLogOpen(true)}>
            <Plus className="size-4" /> Log issue
          </Button>
        }
      />

      {/* filter pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count =
            f.key === "" ? total : f.key === "OPEN" ? data?.counts.OPEN ?? 0 : f.key === "IN_PROGRESS" ? data?.counts.IN_PROGRESS ?? 0 : data?.counts.RESOLVED ?? 0;
          const active = status === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={cn(
                "flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
                active
                  ? "border-emerald-500/40 bg-emerald-500/15 font-medium text-emerald-700 dark:text-emerald-400"
                  : "border-border/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {f.label}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-emerald-500/20" : "bg-muted")}>{count}</span>
            </button>
          );
        })}
      </div>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.complaints.length === 0 ? (
        <Card className="rounded-xl border-border/60 shadow-sm">
          <EmptyState
            icon={Wrench}
            title={status ? `No ${FILTERS.find((f) => f.key === status)?.label.toLowerCase()} issues` : "No issues logged"}
            hint={status ? "Try a different filter." : "Tenant complaints and repair jobs are tracked here with optional repair costs."}
            action={
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setLogOpen(true)}>
                <Plus className="size-4" /> Log issue
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.complaints.map((c) => (
            <IssueCard key={c.id} row={c} busy={busyId === c.id} onAdvance={() => setStatusFor(c, c.status === "OPEN" ? "IN_PROGRESS" : c.status === "IN_PROGRESS" ? "RESOLVED" : "OPEN")} onResolve={() => setResolveTarget(c)} />
          ))}
        </div>
      )}

      <LogIssueDialog
        open={logOpen}
        onClose={() => setLogOpen(false)}
        rooms={rooms.data?.rooms ?? []}
        categories={data?.categories ?? []}
        onSaved={reload}
      />
      <ResolveDialog row={resolveTarget} onClose={() => setResolveTarget(null)} onSaved={reload} />
    </div>
  );
}

function ageInDays(iso: string): number {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

function IssueCard({
  row,
  busy,
  onAdvance,
  onResolve,
}: {
  row: ComplaintRow;
  busy: boolean;
  onAdvance: () => void;
  onResolve: () => void;
}) {
  const age = ageInDays(row.date);
  const nextLabel = row.status === "OPEN" ? "Start work" : row.status === "IN_PROGRESS" ? "Resolve" : "Reopen";
  return (
    <Card className="flex flex-col rounded-xl border-border/60 shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-snug">{row.title}</p>
          <StatusBadge status={row.priority} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {row.roomLabel && (
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Room {row.roomLabel}</span>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{row.category.charAt(0) + row.category.slice(1).toLowerCase()}</span>
          <span className="ml-auto flex items-center gap-1">
            <Clock className="size-3.5" />
            {age === 0 ? "today" : `${age}d old`}
          </span>
        </div>
        {row.notes && <p className="line-clamp-2 text-sm text-muted-foreground">{row.notes}</p>}
        {row.status === "RESOLVED" && row.cost != null && row.cost > 0 && (
          <p className="text-xs text-muted-foreground">
            Repair cost: <Money value={row.cost} />
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-1">
          <StatusBadge status={row.status} />
          <div className="ml-auto flex items-center gap-1.5">
            {row.status === "IN_PROGRESS" && (
              <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" disabled={busy} onClick={onResolve}>
                <CheckCircle2 className="size-3.5" /> Resolve
              </Button>
            )}
            {row.status !== "IN_PROGRESS" && (
              <Button
                variant={row.status === "OPEN" ? "outline" : "ghost"}
                size="sm"
                className="h-9 gap-1 text-xs"
                disabled={busy}
                onClick={onAdvance}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : row.status === "RESOLVED" ? <AlertCircle className="size-3.5" /> : <ArrowRight className="size-3.5" />}
                {nextLabel}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LogIssueDialog({
  open,
  onClose,
  rooms,
  categories,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  rooms: RoomCard[];
  categories: string[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ title: "", roomId: "NONE", category: "OTHER", priority: "MEDIUM", notes: "" });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!form.title.trim()) {
      toast.error("Issue title is required");
      return;
    }
    setBusy(true);
    try {
      await api("/api/complaints", {
        body: {
          title: form.title.trim(),
          roomId: form.roomId !== "NONE" ? form.roomId : undefined,
          category: form.category,
          priority: form.priority,
          notes: form.notes.trim() || undefined,
        },
      });
      toast.success("Issue logged");
      onSaved();
      onClose();
      setForm({ title: "", roomId: "NONE", category: "OTHER", priority: "MEDIUM", notes: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not log issue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-5" /> Log issue
          </DialogTitle>
          <DialogDescription>Track complaints and repairs — resolved costs can be auto-logged as expenses</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Geyser leaking in 2nd floor bathroom" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Room</Label>
              <Select value={form.roomId} onValueChange={(v) => setForm((f) => ({ ...f, roomId: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Common area / none</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>Room {r.number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(categories.length ? categories : ["ELECTRICAL", "PLUMBING", "CLEANLINESS", "INTERNET", "FOOD", "FURNITURE", "OTHER"]).map((c) => (
                    <SelectItem key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High — urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="optional details" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Log issue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({ row, onClose, onSaved }: { row: ComplaintRow | null; onClose: () => void; onSaved: () => void }) {
  const [cost, setCost] = useState("");
  const [addExpense, setAddExpense] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!row || busy) return;
    setBusy(true);
    try {
      const n = Number(cost) || 0;
      await api(`/api/complaints/${row.id}`, {
        method: "PATCH",
        body: { status: "RESOLVED", cost: n > 0 ? n : undefined, addExpense: n > 0 && addExpense },
      });
      toast.success(`"${row.title}" resolved`, {
        description: n > 0 && addExpense ? `Repair expense of ${fmtINR(n)} logged under ${monthLabel(new Date().toISOString().slice(0, 7))}` : undefined,
      });
      onSaved();
      onClose();
      setCost("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve issue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" /> Resolve issue
          </DialogTitle>
          <DialogDescription>{row ? `"${row.title}"${row.roomLabel ? ` · Room ${row.roomLabel}` : ""}` : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Repair cost (₹)</Label>
            <Input type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0 if none" />
          </div>
          <label className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
            <span className="text-sm">Log cost as a REPAIR expense</span>
            <Switch checked={addExpense} onCheckedChange={setAddExpense} disabled={!Number(cost)} />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Mark resolved
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
