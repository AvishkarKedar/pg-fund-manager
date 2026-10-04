"use client";

import { useState } from "react";
import {
  Building2, Loader2, LogOut, Plus, Save, Settings2, Sparkles, Trash2, UserRound, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { api } from "@/hooks/pg/useApi";
import type { HouseRules, MeResponse, Preferences, PropertySettings, RateCardItem } from "@/lib/client";
import { initials } from "@/lib/client";

export function SettingsView({ me, reloadMe }: { me: MeResponse; reloadMe: () => void }) {
  const user = me.user!;
  const s = me.settings ?? {};

  async function logout() {
    try {
      await api("/api/auth/logout", { body: {} });
    } catch {
      /* ignore */
    }
    reloadMe();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Property profile, preferences and data tools</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PropertyCard initial={s.property ?? {}} />
        <PreferencesCard initial={s.preferences ?? {}} />
        <RateCardCard initial={s.rateCard ?? []} />
        <RulesCard initial={s.rules ?? {}} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DataDoctorCard />
        <Card className="rounded-xl border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="size-4.5 text-muted-foreground" /> Account
            </CardTitle>
            <CardDescription>Signed-in user</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {initials(user.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email} · {user.role.toLowerCase()}</p>
              </div>
            </div>
            <Separator />
            <Button variant="outline" className="w-full gap-2" onClick={logout}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ---------- generic save-card hook ----------
 * Keeps a local editable copy + a committed baseline. Re-syncs when the
 * incoming settings identity changes (parent refetch) using the
 * render-time adjustment pattern (no effects needed). */
function useDirty<T>(initial: T) {
  const [state, setState] = useState<{ base: T; value: T }>({ base: initial, value: initial });
  if (state.base !== initial) {
    setState({ base: initial, value: initial });
  }
  const dirty = JSON.stringify(state.value) !== JSON.stringify(state.base);
  return {
    value: state.value,
    setValue: (update: T | ((prev: T) => T)) =>
      setState((s) => ({ ...s, value: typeof update === "function" ? (update as (prev: T) => T)(s.value) : update })),
    dirty,
    reset: () => setState((s) => ({ ...s, value: s.base })),
    commit: () => setState((s) => ({ ...s, base: s.value })),
  };
}

async function patchSettings(key: string, payload: unknown) {
  await api("/api/settings", { method: "PATCH", body: { [key]: payload } });
}

function SaveBar({ dirty, busy, onSave, onReset, label }: { dirty: boolean; busy: boolean; onSave: () => void; onReset: () => void; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40" disabled={!dirty || busy} onClick={onSave}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {label}
      </Button>
      {dirty && (
        <Button size="sm" variant="ghost" onClick={onReset} disabled={busy}>
          Reset
        </Button>
      )}
    </div>
  );
}

/* ---------- property profile ---------- */
function PropertyCard({ initial }: { initial: PropertySettings }) {
  const { value, setValue, dirty, reset, commit } = useDirty<PropertySettings>(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof PropertySettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValue((v) => ({ ...v, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    try {
      await patchSettings("property", value);
      commit();
      toast.success("Property profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="size-4.5 text-muted-foreground" /> Property profile
        </CardTitle>
        <CardDescription>Appears on receipts and reminders</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Property name</Label>
            <Input value={value.name ?? ""} onChange={set("name")} placeholder="Sunrise PG" />
          </div>
          <div className="space-y-1.5">
            <Label>Owner name</Label>
            <Input value={value.ownerName ?? ""} onChange={set("ownerName")} placeholder="Rahul Sharma" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={value.phone ?? ""} onChange={set("phone")} placeholder="+91 98765 43210" />
          </div>
          <div className="space-y-1.5">
            <Label>UPI ID</Label>
            <Input value={value.upiId ?? ""} onChange={set("upiId")} placeholder="sunrisepg@okhdfcbank" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Address</Label>
          <Textarea rows={2} value={value.address ?? ""} onChange={set("address")} placeholder="Plot 24, Hinjewadi Phase 2, Pune" />
        </div>
        <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={reset} label="Save profile" />
      </CardContent>
    </Card>
  );
}

/* ---------- preferences ---------- */
function PreferencesCard({ initial }: { initial: Preferences }) {
  const { value, setValue, dirty, reset, commit } = useDirty<Preferences>(initial);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await patchSettings("preferences", {
        ...value,
        defaultDueDay: Number(value.defaultDueDay) || 5,
        graceDays: Number(value.graceDays) || 0,
      });
      commit();
      toast.success("Preferences saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="size-4.5 text-muted-foreground" /> Preferences
        </CardTitle>
        <CardDescription>Rent defaults for new tenancies</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Default due day (1–28)</Label>
            <Input
              type="number" min="1" max="28"
              value={value.defaultDueDay ?? 5}
              onChange={(e) => setValue((v) => ({ ...v, defaultDueDay: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">Day of month rent falls due</p>
          </div>
          <div className="space-y-1.5">
            <Label>Grace days</Label>
            <Input
              type="number" min="0" max="15"
              value={value.graceDays ?? 5}
              onChange={(e) => setValue((v) => ({ ...v, graceDays: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">After this, invoices turn overdue</p>
          </div>
        </div>
        <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={reset} label="Save preferences" />
      </CardContent>
    </Card>
  );
}

/* ---------- rate card ---------- */
function RateCardCard({ initial }: { initial: RateCardItem[] }) {
  const { value, setValue, dirty, reset, commit } = useDirty<RateCardItem[]>(initial);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await patchSettings("rateCard", value);
      commit();
      toast.success("Rate card saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function addRow() {
    setValue((rows) => [
      ...rows,
      { id: `r${Date.now()}`, label: "", amount: 0, note: "" },
    ]);
  }

  return (
    <Card className="rounded-xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4.5 text-muted-foreground" /> Rate card
        </CardTitle>
        <CardDescription>Plans you quote to new tenants</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="thin-scroll max-h-72 space-y-2 overflow-y-auto pr-1">
          {value.length === 0 && (
            <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
              No plans yet — add your first rate card entry.
            </p>
          )}
          {value.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_100px_1fr_auto]">
              <Input
                placeholder="Plan name"
                className="h-9 text-sm"
                value={r.label}
                onChange={(e) => setValue((rows) => rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <Input
                type="number" min="0" placeholder="₹"
                className="h-9 text-sm tabular-nums"
                value={r.amount || ""}
                onChange={(e) => setValue((rows) => rows.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))}
              />
              <Input
                placeholder="Note (optional)"
                className="h-9 text-sm"
                value={r.note ?? ""}
                onChange={(e) => setValue((rows) => rows.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
              />
              <Button
                variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-rose-600"
                aria-label="Remove plan"
                onClick={() => setValue((rows) => rows.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
          <Plus className="size-4" /> Add plan
        </Button>
        <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={reset} label="Save rate card" />
      </CardContent>
    </Card>
  );
}

/* ---------- house rules ---------- */
const RULE_FIELDS: { key: keyof HouseRules; label: string; placeholder: string }[] = [
  { key: "visiting", label: "Visiting hours", placeholder: "10 AM – 8 PM on weekends" },
  { key: "quiet", label: "Quiet hours", placeholder: "11 PM – 6 AM" },
  { key: "guests", label: "Guests policy", placeholder: "Day visitors allowed with notice; no overnight guests" },
  { key: "lockout", label: "Gate lockout", placeholder: "Main gate closes at 11:30 PM" },
  { key: "other", label: "Other rules", placeholder: "No smoking indoors · keep common areas clean" },
];

function RulesCard({ initial }: { initial: HouseRules }) {
  const { value, setValue, dirty, reset, commit } = useDirty<HouseRules>(initial);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await patchSettings("rules", value);
      commit();
      toast.success("House rules saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="size-4.5 text-muted-foreground" /> House rules
        </CardTitle>
        <CardDescription>Shared with tenants on notice &amp; agreements</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {RULE_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label>{f.label}</Label>
            <Textarea
              rows={2}
              placeholder={f.placeholder}
              value={value[f.key] ?? ""}
              onChange={(e) => setValue((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
        <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={reset} label="Save rules" />
      </CardContent>
    </Card>
  );
}

/* ---------- data doctor ---------- */
function DataDoctorCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ bedsRelabeled: number; slotsRenumbered: number; invoicesRefreshed: number; tenantsMerged: number } | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api<{ result: typeof result }>("/api/maintenance");
      setResult(res.result);
      toast.success("Data doctor finished", {
        description: "Beds, slots and invoices are now consistent.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sort & fix failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4.5 text-emerald-600 dark:text-emerald-400" /> Data doctor
        </CardTitle>
        <CardDescription>One-click consistency pass on the whole database</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li>· Renumbers bed slots contiguously and relabels A, B, C…</li>
          <li>· Self-heals every invoice status from the payment log</li>
          <li>· Merges duplicate tenants (same phone number)</li>
          <li>· Ensures the current month&apos;s invoices exist</li>
        </ul>
        <Button className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />}
          {busy ? "Fixing…" : "Sort & fix data now"}
        </Button>
        {result && (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-xs">
            <p className="font-medium text-emerald-700 dark:text-emerald-400">Last run</p>
            <p className="mt-1 text-muted-foreground">
              {result.bedsRelabeled} beds relabeled · {result.slotsRenumbered} slots renumbered · {result.invoicesRefreshed} invoices refreshed ·{" "}
              {result.tenantsMerged} tenants merged
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
