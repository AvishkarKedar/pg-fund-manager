"use client";

import { useRef, useState } from "react";
import { Copy, Megaphone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useApi } from "@/hooks/pg/useApi";
import type { SettingsResponse, TenantRow, TenantsResponse } from "@/lib/client";
import { fmtINR, monthLabel, renderReminderTemplate, waLink } from "@/lib/client";
import { EmptyState, ErrorState } from "@/components/pg/bits";

/** Composer default when no template is saved in Settings. */
const DEFAULT_BROADCAST_TEMPLATE = "Hi {name}, this is a reminder from Sunrise PG.";

const BROADCAST_PLACEHOLDERS = [
  "name", "first_name", "property", "room", "bed", "month", "amount", "due_day", "phone", "upi",
] as const;

/** Same rule as lib/client's waLink: digits only, 91-prefixed when 10 digits. */
function phoneDigits(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length === 10 ? `91${digits}` : digits;
}

export function BroadcastSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Radix mounts/unmounts the content with the sheet lifecycle, so the
          composer below fetches /api/tenants + /api/settings exactly once per open. */}
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60 px-5 py-4">
          <SheetTitle className="sr-only">Broadcast message</SheetTitle>
          <SheetDescription className="sr-only">Send a WhatsApp message to selected tenants</SheetDescription>
          <div className="flex items-center gap-3 pr-6">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <Megaphone className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-none">Broadcast message</p>
              <p className="mt-1 text-sm text-muted-foreground">Send a WhatsApp message to selected tenants</p>
            </div>
          </div>
        </SheetHeader>
        <BroadcastComposer />
      </SheetContent>
    </Sheet>
  );
}

function BroadcastComposer() {
  const list = useApi<TenantsResponse>("/api/tenants");
  const settings = useApi<SettingsResponse>("/api/settings");

  // Derived-default state (no effects): null selection override = everyone
  // selected; null message draft = saved template (or broadcast default).
  const [selectionOverride, setSelectionOverride] = useState<Set<string> | null>(null);
  const [messageDraft, setMessageDraft] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // only ACTIVE tenants with a usable phone number can be messaged
  const eligible = (list.data?.tenants ?? []).filter((t) => t.status === "ACTIVE" && phoneDigits(t.phone));
  const selected = selectionOverride ?? new Set(eligible.map((t) => t.id));
  const selectedCount = eligible.filter((t) => selected.has(t.id)).length;
  const allSelected = eligible.length > 0 && selectedCount === eligible.length;

  const savedTemplate = settings.data?.settings?.reminderTemplate;
  const message = messageDraft ?? (savedTemplate?.trim() ? savedTemplate : DEFAULT_BROADCAST_TEMPLATE);
  const propertyName = settings.data?.settings?.property?.name || "Sunrise PG";
  const upiId = settings.data?.settings?.property?.upiId || "";
  const monthText = list.data ? monthLabel(list.data.month, true) : "";

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectionOverride(next);
  }

  /** Render the composer template for one tenant. */
  function renderFor(t: TenantRow): string {
    return renderReminderTemplate(message, {
      name: t.name,
      first_name: t.name.split(" ")[0] ?? t.name,
      property: propertyName,
      room: t.room ?? "",
      bed: t.bed ?? "",
      amount: t.monthlyRent != null ? fmtINR(t.monthlyRent) : "",
      month: monthText,
      due_day: t.dueDay != null ? String(t.dueDay) : "",
      phone: t.phone ?? "",
      upi: upiId,
    });
  }

  /** Insert {placeholder} at the textarea cursor (settings template pattern). */
  function insertPlaceholder(key: string) {
    const token = `{${key}}`;
    const ta = taRef.current;
    if (!ta) {
      setMessageDraft(message + token);
      return;
    }
    const start = ta.selectionStart ?? message.length;
    const end = ta.selectionEnd ?? start;
    setMessageDraft(message.slice(0, start) + token + message.slice(end));
    const caret = start + token.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  }

  async function copyNumbers() {
    const digits = eligible
      .filter((t) => selected.has(t.id))
      .map((t) => phoneDigits(t.phone))
      .filter((d): d is string => !!d);
    if (!digits.length) return;
    try {
      await navigator.clipboard.writeText(digits.join(","));
      toast.success(`${digits.length} numbers copied`);
    } catch {
      toast.error("Clipboard unavailable — copy numbers manually");
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Message copied");
    } catch {
      toast.error("Clipboard unavailable — copy manually");
    }
  }

  function openWhatsApp() {
    const first = eligible.find((t) => selected.has(t.id));
    if (!first) return;
    window.open(waLink(first.phone, renderFor(first)), "_blank", "noopener,noreferrer");
  }

  const composerVisible = !list.error && !!list.data && eligible.length > 0;

  return (
    <>
      {list.error ? (
        <div className="px-5 py-4">
          <ErrorState message={list.error} onRetry={list.reload} />
        </div>
      ) : list.loading || !list.data ? (
        <div className="space-y-2 px-5 py-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : eligible.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No tenants to message"
          hint="Active tenants with a phone number on file will appear here."
          className="py-12"
        />
      ) : (
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* selection controls */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setSelectionOverride(allSelected ? new Set() : null)}
            >
              {allSelected ? "Clear" : "Select all"}
            </Button>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {selectedCount} of {eligible.length} selected
            </span>
          </div>

          {/* tenant list */}
          <ul className="thin-scroll max-h-72 space-y-1 overflow-y-auto pr-1">
            {eligible.map((t) => (
              <li
                key={t.id}
                onClick={() => toggle(t.id)}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
              >
                <Checkbox
                  checked={selected.has(t.id)}
                  onCheckedChange={() => toggle(t.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${t.name}`}
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.room ? `${t.room} · ${t.bed}` : "Unassigned"} ·{" "}
                    <span className="tabular-nums">{phoneDigits(t.phone) ?? "—"}</span>
                  </p>
                </div>
                <a
                  href={waLink(t.phone, renderFor(t))}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`WhatsApp ${t.name}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                >
                  <MessageCircle className="size-3.5" />
                </a>
              </li>
            ))}
          </ul>

          {/* message composer */}
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="broadcast-message">Message</Label>
            <Textarea
              id="broadcast-message"
              ref={taRef}
              rows={4}
              value={message}
              onChange={(e) => setMessageDraft(e.target.value)}
              placeholder={DEFAULT_BROADCAST_TEMPLATE}
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-xs text-muted-foreground">Variables:</span>
              {BROADCAST_PLACEHOLDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={`Insert {${p}}`}
                  onClick={() => insertPlaceholder(p)}
                  className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-400"
                >
                  {`{${p}}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <SheetFooter className="mt-auto flex-row flex-wrap items-center gap-2 border-t border-border/60 px-5 py-4">
        <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={selectedCount === 0} onClick={copyNumbers}>
          <Copy className="size-4" /> Copy all numbers
        </Button>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={!composerVisible} onClick={copyMessage}>
          <Copy className="size-4" /> Copy message
        </Button>
        <Button
          size="sm"
          className="ml-auto h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          disabled={selectedCount === 0}
          onClick={openWhatsApp}
        >
          <MessageCircle className="size-4" /> Open WhatsApp
        </Button>
      </SheetFooter>
    </>
  );
}
