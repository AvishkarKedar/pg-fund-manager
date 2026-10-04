"use client";

import { useMemo, useRef, useState } from "react";
import {
  Building2, Download, Loader2, LogOut, MessageCircle, Plus, Save, Settings2, Sparkles, Trash2, Upload, UserRound, Wallet, Wrench,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { api, useApi } from "@/hooks/pg/useApi";
import type { HouseRules, MeResponse, Preferences, PropertySettings, RateCardItem, SettingsResponse } from "@/lib/client";
import { DEFAULT_REMINDER_TEMPLATE, fmtINR, initials, monthLabel, renderReminderTemplate, todayYm } from "@/lib/client";

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

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <PropertyCard initial={s.property ?? {}} />
        <PreferencesCard initial={s.preferences ?? {}} />
        <RateCardCard initial={s.rateCard ?? []} />
        <RulesCard initial={s.rules ?? {}} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <DataDoctorCard />
        <BudgetsCard />
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
        <ReminderTemplateCard />
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
        <div className="thin-scroll max-h-80 space-y-2 overflow-y-auto pr-1">
          {value.length === 0 && (
            <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
              No plans yet — add your first rate card entry.
            </p>
          )}
          {value.map((r, i) => (
            <div key={r.id} className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Plan name"
                  className="h-9 min-w-0 flex-1 text-sm"
                  value={r.label}
                  onChange={(e) => setValue((rows) => rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <Button
                  variant="ghost" size="icon"
                  className="size-9 shrink-0 text-muted-foreground hover:text-rose-600"
                  aria-label="Remove plan"
                  onClick={() => setValue((rows) => rows.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min="0" placeholder="₹"
                  className="h-9 w-24 shrink-0 text-sm tabular-nums"
                  value={r.amount || ""}
                  onChange={(e) => setValue((rows) => rows.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))}
                />
                <Input
                  placeholder="Note (optional)"
                  className="h-9 min-w-0 flex-1 text-sm"
                  value={r.note ?? ""}
                  onChange={(e) => setValue((rows) => rows.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                />
              </div>
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

/* ---------- expense budgets ---------- */
const BUDGET_CATEGORIES = ["FOOD", "ELECTRICITY", "WATER", "MAINTENANCE", "SALARY", "INTERNET", "CLEANING", "REPAIR", "RENT", "OTHER"];
const prettyCat = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();

interface BudgetRow {
  category: string;
  amount: number;
}

function BudgetsCard() {
  // /api/settings (not /api/auth/me) — budgets live in the settings whitelist
  const { data: settingsData, loading: settingsLoading } = useApi<SettingsResponse>("/api/settings");
  const raw = settingsData?.settings?.expenseBudgets;
  // stable identity while settings are unchanged — keeps useDirty in sync
  const initial = useMemo<BudgetRow[]>(
    () => Object.entries(raw ?? {}).map(([category, amount]) => ({ category, amount: Number(amount) || 0 })),
    [raw]
  );
  const { value, setValue, dirty, reset, commit } = useDirty<BudgetRow[]>(initial);
  const [busy, setBusy] = useState(false);

  const used = new Set(value.map((r) => r.category));
  const available = BUDGET_CATEGORIES.filter((c) => !used.has(c));

  async function save() {
    setBusy(true);
    try {
      const payload: Record<string, number> = {};
      for (const r of value) {
        if (r.category && r.amount > 0) payload[r.category] = Math.round(r.amount);
      }
      await patchSettings("expenseBudgets", payload);
      commit();
      toast.success("Expense budgets saved");
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
          <Wallet className="size-4.5 text-muted-foreground" /> Expense budgets
        </CardTitle>
        <CardDescription>Monthly spend caps per category</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {settingsLoading && !settingsData ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : value.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
            No budgets yet — add a monthly cap for a category.
          </p>
        ) : (
          <div className="space-y-2">
            {value.map((r, i) => (
              <div key={`${r.category}-${i}`} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
                <Select
                  value={r.category}
                  onValueChange={(v) => setValue((rows) => rows.map((x, j) => (j === i ? { ...x, category: v } : x)))}
                >
                  <SelectTrigger className="h-9 min-w-0 flex-1 text-sm" aria-label="Budget category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[r.category, ...BUDGET_CATEGORIES.filter((c) => c !== r.category)].map((c) => (
                      <SelectItem key={c} value={c}>{prettyCat(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number" min="0" placeholder="₹"
                  className="h-9 w-28 shrink-0 text-sm tabular-nums"
                  value={r.amount || ""}
                  onChange={(e) => setValue((rows) => rows.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))}
                  aria-label={`Monthly budget for ${prettyCat(r.category)}`}
                />
                <Button
                  variant="ghost" size="icon"
                  className="size-9 shrink-0 text-muted-foreground hover:text-rose-600"
                  aria-label="Remove budget"
                  onClick={() => setValue((rows) => rows.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <Button
          variant="outline" size="sm" className="gap-1.5"
          disabled={available.length === 0}
          onClick={() =>
            setValue((rows) => [...rows, { category: available[0], amount: 0 }])
          }
        >
          <Plus className="size-4" /> Add budget
        </Button>
        <p className="text-xs text-muted-foreground">
          Track monthly spend against a cap per category. Over-budget categories are flagged on the Expenses page.
        </p>
        <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={reset} label="Save budgets" />
      </CardContent>
    </Card>
  );
}

/* ---------- WhatsApp reminder template ---------- */
const REMINDER_PLACEHOLDERS = [
  "name", "first_name", "property", "room", "bed", "month", "amount", "due_day", "phone", "upi",
] as const;

function ReminderTemplateCard() {
  // /api/settings (not /api/auth/me) — always fresh, matches the budgets card pattern
  const { data: settingsData, loading } = useApi<SettingsResponse>("/api/settings");
  const raw = settingsData?.settings?.reminderTemplate;
  const property = settingsData?.settings?.property;
  const { value, setValue, dirty, reset, commit } = useDirty<string>(raw?.trim() ? raw : DEFAULT_REMINDER_TEMPLATE);
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  /** Insert {placeholder} at the textarea cursor (replacing any selection). */
  function insertPlaceholder(key: string) {
    const token = `{${key}}`;
    const ta = taRef.current;
    if (!ta) {
      setValue((v) => v + token);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? start;
    setValue(value.slice(0, start) + token + value.slice(end));
    const caret = start + token.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  }

  async function save() {
    setBusy(true);
    try {
      await patchSettings("reminderTemplate", value);
      commit();
      toast.success("Reminder template saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const preview = renderReminderTemplate(value, {
    name: "Sneha Patil",
    first_name: "Sneha",
    property: property?.name || "Sunrise PG",
    room: "101",
    bed: "C",
    month: monthLabel(todayYm(), true),
    amount: fmtINR(6500),
    due_day: "5",
    phone: "+91 96100 15838",
    upi: property?.upiId || "sunrisepg@okhdfcbank",
  });

  return (
    <Card className="rounded-xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="size-4.5 text-muted-foreground" /> Reminder template
        </CardTitle>
        <CardDescription>Message used by WhatsApp rent reminders</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !settingsData ? (
          <div className="space-y-2">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-9 w-3/4 rounded-lg" />
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="reminder-template">Message</Label>
              <Textarea
                id="reminder-template"
                ref={taRef}
                rows={5}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={DEFAULT_REMINDER_TEMPLATE}
              />
              <p className="text-xs text-muted-foreground">
                Powers the &ldquo;Remind unpaid&rdquo; WhatsApp links on the Rent page.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Placeholders — click to insert at cursor</Label>
              <div className="flex flex-wrap gap-1.5">
                {REMINDER_PLACEHOLDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-label={`Insert placeholder {${p}}`}
                    onClick={() => insertPlaceholder(p)}
                    className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-400"
                  >
                    {`{${p}}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Preview</Label>
              <blockquote className="whitespace-pre-wrap rounded-lg border border-border/60 border-l-2 border-l-emerald-500/60 bg-muted/20 px-3 py-2.5 text-sm text-foreground/90">
                {preview}
              </blockquote>
            </div>
            <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={reset} label="Save template" />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- data doctor + backup ---------- */
function DataDoctorCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ bedsRelabeled: number; slotsRenumbered: number; invoicesRefreshed: number; tenantsMerged: number } | null>(null);

  // backup & restore state
  const [dlBusy, setDlBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [pending, setPending] = useState<{ name: string; json: unknown } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  async function downloadBackup() {
    if (dlBusy || restoreBusy) return;
    setDlBusy(true);
    try {
      const res = await fetch("/api/backup", { credentials: "same-origin" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof body.error === "string" ? body.error : `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^";]+)"?/.exec(cd);
      const filename = match?.[1] ?? "pg-backup.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded", { description: `${filename} · ${(blob.size / 1024).toFixed(1)} KB` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup download failed");
    } finally {
      setDlBusy(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    void (async () => {
      try {
        const text = await file.text();
        const json: unknown = JSON.parse(text);
        setPending({ name: file.name, json });
        setConfirmRestore(true);
      } catch {
        toast.error("Could not read backup file", { description: "Choose a JSON file exported from this app." });
      }
    })();
  }

  async function doRestore() {
    if (!pending || restoreBusy) return;
    setRestoreBusy(true);
    try {
      const res = await api<{ ok: boolean; restored: Record<string, number> }>("/api/backup", { body: pending.json });
      const r = res.restored;
      toast.success("Backup restored", {
        description: `${r.rooms} rooms · ${r.tenants} tenants · ${r.payments} payments · ${r.expenses} expenses`,
      });
      setConfirmRestore(false);
      setPending(null);
      // give the toast a beat to land, then reload so every view refetches
      window.setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed", {
        description: "Nothing was changed — your current data is intact.",
      });
      setRestoreBusy(false);
    }
  }

  return (
    <Card className="rounded-xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4.5 text-emerald-600 dark:text-emerald-400" /> Data doctor
        </CardTitle>
        <CardDescription>One-click consistency pass + full backup</CardDescription>
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

        <Separator />

        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Download className="size-4 text-muted-foreground" /> Backup &amp; restore
          </div>
          <p className="text-xs text-muted-foreground">
            One JSON file with every room, bed, tenant, tenancy, invoice, payment, expense, complaint and setting.
            Restore replaces the whole database — export a backup first.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadBackup} disabled={dlBusy || restoreBusy}>
              {dlBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Download backup
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={dlBusy || restoreBusy}>
              {restoreBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Restore backup
            </Button>
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
        </div>
      </CardContent>

      <AlertDialog open={confirmRestore} onOpenChange={(v) => !v && setConfirmRestore(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace all current data?</AlertDialogTitle>
            <AlertDialogDescription>
              This wipes rooms, tenants, payments, expenses and settings, then restores from &ldquo;{pending?.name}&rdquo;.
              Export a backup first!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-rose-600 hover:bg-rose-700"
              disabled={restoreBusy}
              onClick={(e) => {
                e.preventDefault(); // stay open while the restore runs
                void doRestore();
              }}
            >
              {restoreBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {restoreBusy ? "Restoring…" : "Replace everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
