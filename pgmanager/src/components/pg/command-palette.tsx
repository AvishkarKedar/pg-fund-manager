"use client";

import { useEffect, useRef, useState } from "react";
import { BedDouble, Loader2, LogOut, Moon, Sparkles, Sun, Users, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { api } from "@/hooks/pg/useApi";
import { cn } from "@/lib/utils";
import type { NavItem, ViewKey } from "./app-shell";

/** True on Apple platforms (⌘ label); false elsewhere (Ctrl label). SSR-safe. */
export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? "");

const DEBOUNCE_MS = 250;

interface TenantHit {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  room: string | null;
  bed: string | null;
}

interface RoomHit {
  id: string;
  number: string;
  floor: number;
  occupiedBeds: number;
  totalBeds: number;
}

interface SearchResponse {
  tenants: TenantHit[];
  rooms: RoomHit[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navItems: NavItem[];
  onNavigate: (view: ViewKey) => void;
  onOpenTenant: (tenantId: string) => void;
  onToggleTheme: () => void;
  onSignOut: () => void;
  onSortFix: () => void;
  onInsights: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  NOTICE: "Notice",
  CHECKED_OUT: "Checked out",
};

function statusClasses(status: string): string {
  if (status === "ACTIVE") return "text-emerald-600 dark:text-emerald-400";
  if (status === "NOTICE") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function tenantSubtitle(t: TenantHit): string {
  const location = t.room ? `Room ${t.room}${t.bed ? ` · Bed ${t.bed}` : ""}` : "No active bed";
  return t.phone ? `${t.phone} · ${location}` : location;
}

/**
 * Global Ctrl/Cmd+K palette: quick actions when the query is empty,
 * debounced server search (tenants + rooms) once the user types.
 */
export function CommandPalette({
  open,
  onOpenChange,
  navItems,
  onNavigate,
  onOpenTenant,
  onToggleTheme,
  onSignOut,
  onSortFix,
  onInsights,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const nonceRef = useRef(0);

  const trimmed = query.trim();

  // fresh input + results every time the palette opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setLoading(false);
    }
  }, [open]);

  // debounced search; nonce guard drops stale responses (race safety)
  useEffect(() => {
    if (!open) {
      nonceRef.current += 1; // invalidate anything still in flight
      return;
    }
    const q = query.trim();
    if (!q) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const nonce = ++nonceRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await api<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`, {
            method: "GET",
          });
          if (nonceRef.current !== nonce) return;
          setResults(res);
        } catch {
          if (nonceRef.current !== nonce) return;
          setResults({ tenants: [], rooms: [] });
        } finally {
          if (nonceRef.current === nonce) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, query]);

  /** Execute an action and close the palette. */
  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="overflow-hidden rounded-xl p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search tenants and rooms, or jump to any view
        </DialogDescription>
        <Command
          shouldFilter={false}
          className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search tenants, rooms, or jump anywhere…"
          />
          <CommandList>
            {trimmed === "" ? (
              <CommandGroup heading="Quick actions">
                {navItems.map((item) => (
                  <CommandItem
                    key={item.key}
                    value={`go-${item.key}`}
                    onSelect={() => run(() => onNavigate(item.key))}
                  >
                    <item.icon />
                    <span className="truncate">Go to {item.label}</span>
                  </CommandItem>
                ))}
                <CommandSeparator />
                <CommandItem value="action-toggle-theme" onSelect={() => run(onToggleTheme)}>
                  <Sun className="dark:hidden" />
                  <Moon className="hidden dark:block" />
                  <span className="truncate">Toggle theme</span>
                </CommandItem>
                <CommandItem value="action-ai-insights" onSelect={() => run(onInsights)}>
                  <Sparkles className="text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">Generate AI insights</span>
                </CommandItem>
                <CommandItem value="action-sort-fix" onSelect={() => run(onSortFix)}>
                  <Wrench />
                  <span className="truncate">Run Sort &amp; Fix</span>
                </CommandItem>
                <CommandItem value="action-sign-out" onSelect={() => run(onSignOut)}>
                  <LogOut className="text-rose-500 dark:text-rose-400" />
                  <span className="truncate">Sign out</span>
                </CommandItem>
              </CommandGroup>
            ) : (
              <>
                {loading && (
                  <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Searching…
                  </div>
                )}
                {!loading && results && results.tenants.length > 0 && (
                  <CommandGroup heading="Tenants">
                    {results.tenants.map((t) => (
                      <CommandItem
                        key={t.id}
                        value={`tenant-${t.id}`}
                        onSelect={() => run(() => onOpenTenant(t.id))}
                      >
                        <Users className="text-emerald-600 dark:text-emerald-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{t.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{tenantSubtitle(t)}</p>
                        </div>
                        <span className={cn("shrink-0 text-xs", statusClasses(t.status))}>
                          {STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {!loading && results && results.rooms.length > 0 && (
                  <CommandGroup heading="Rooms">
                    {results.rooms.map((r) => (
                      <CommandItem
                        key={r.id}
                        value={`room-${r.id}`}
                        onSelect={() => run(() => onNavigate("rooms"))}
                      >
                        <BedDouble />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">Room {r.number}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            Floor {r.floor} · {r.occupiedBeds}/{r.totalBeds} beds occupied
                          </p>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {!loading && results && results.tenants.length === 0 && results.rooms.length === 0 && (
                  <CommandEmpty>No matches for “{trimmed}”</CommandEmpty>
                )}
              </>
            )}
          </CommandList>
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            <span>↑↓ navigate · ↵ select · esc close</span>
            <span className="flex items-center gap-1.5">
              Search
              <kbd
                suppressHydrationWarning
                className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]"
              >
                {isMac ? "⌘ K" : "Ctrl K"}
              </kbd>
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
