"use client";

import { useState } from "react";
import {
  BarChart3, BedDouble, CreditCard, FileSpreadsheet, LayoutDashboard, LogOut,
  Menu, Moon, ReceiptIndianRupee, RefreshCw, Settings as SettingsIcon, Sparkles,
  Sun, TrendingDown, Users, Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/hooks/pg/useApi";
import { usePgTheme } from "@/hooks/pg/useTheme";
import type { MeResponse } from "@/lib/client";
import { initials, monthLabel, todayYm } from "@/lib/client";
import { cn } from "@/lib/utils";
import { DashboardView } from "@/components/pg/dashboard-view";
import { RoomsView } from "@/components/pg/rooms-view";
import { TenantsView } from "@/components/pg/tenants-view";
import { RentView } from "@/components/pg/rent-view";
import { PaymentsView } from "@/components/pg/payments-view";
import { ExpensesView } from "@/components/pg/expenses-view";
import { IssuesView } from "@/components/pg/issues-view";
import { ImportWizard } from "@/components/pg/import-wizard";
import { ReportsView } from "@/components/pg/reports-view";
import { SettingsView } from "@/components/pg/settings-view";

export type ViewKey =
  | "dashboard" | "rooms" | "tenants" | "rent" | "payments"
  | "expenses" | "issues" | "import" | "reports" | "settings";

interface NavItem {
  key: ViewKey;
  label: string;
  subtitle: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", subtitle: "Overview & insights", icon: LayoutDashboard },
  { key: "rooms", label: "Rooms", subtitle: "Occupancy map", icon: BedDouble },
  { key: "tenants", label: "Tenants", subtitle: "Profiles & ledger", icon: Users },
  { key: "rent", label: "Rent", subtitle: "Monthly collections", icon: ReceiptIndianRupee },
  { key: "payments", label: "Payments", subtitle: "Receipts & history", icon: CreditCard },
  { key: "expenses", label: "Expenses", subtitle: "Property costs", icon: TrendingDown },
  { key: "issues", label: "Issues", subtitle: "Complaints & repairs", icon: Wrench },
  { key: "import", label: "Import", subtitle: "Excel / CSV upload", icon: FileSpreadsheet },
  { key: "reports", label: "Reports", subtitle: "Monthly analytics", icon: BarChart3 },
  { key: "settings", label: "Settings", subtitle: "Property & preferences", icon: SettingsIcon },
];

const MOBILE_PRIMARY: ViewKey[] = ["dashboard", "rooms", "tenants", "rent"];

export function AppShell({ me, reloadMe }: { me: MeResponse; reloadMe: () => void }) {
  const [view, setView] = useState<ViewKey>("dashboard");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [insightsNonce, setInsightsNonce] = useState(0);
  const [focusTenantId, setFocusTenantId] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { toggle: toggleTheme } = usePgTheme();

  const user = me.user!;
  const propertyName = me.settings?.property?.name || "My PG";
  const nav = NAV.find((n) => n.key === view)!;

  function navigate(next: ViewKey) {
    setView(next);
    setMoreOpen(false);
  }

  async function sortAndFix() {
    if (fixing) return;
    setFixing(true);
    try {
      const res = await api<{ result: { bedsRelabeled: number; slotsRenumbered: number; invoicesRefreshed: number; tenantsMerged: number } }>(
        "/api/maintenance"
      );
      const r = res.result;
      toast.success("Data doctor finished", {
        description: `${r.bedsRelabeled} beds relabeled · ${r.slotsRenumbered} slots renumbered · ${r.invoicesRefreshed} invoices refreshed · ${r.tenantsMerged} tenants merged`,
      });
      setRefreshSignal((s) => s + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sort & fix failed");
    } finally {
      setFixing(false);
    }
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { body: {} });
    } catch {
      /* ignore */
    }
    reloadMe();
  }

  function goToTenant(tenantId: string) {
    setFocusTenantId(tenantId);
    setView("tenants");
  }

  const themeToggle = (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme" className="size-9">
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1">
        {/* ---------- desktop sidebar ---------- */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-slate-900 text-slate-300 md:flex print:hidden">
          <div className="flex items-center gap-3 px-5 pb-4 pt-5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-sm font-bold text-white shadow-md shadow-emerald-900/40">
              PG
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{propertyName}</p>
              <p className="text-xs text-slate-400">Fund Manager</p>
            </div>
          </div>
          <nav className="thin-scroll flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
            {NAV.map((item) => {
              const active = view === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => navigate(item.key)}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-emerald-500/15 font-medium text-emerald-300"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400" />
                  )}
                  <item.icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="space-y-3 border-t border-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-300">
                {initials(user.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{user.name}</p>
                <p className="truncate text-xs text-slate-400">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {themeToggle}
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="h-9 flex-1 justify-start gap-2 text-slate-400 hover:bg-white/5 hover:text-rose-300"
              >
                <LogOut className="size-4" /> Sign out
              </Button>
            </div>
          </div>
        </aside>

        {/* ---------- main column ---------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* mobile top bar */}
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border/60 bg-background/95 px-4 backdrop-blur md:hidden print:hidden">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-xs font-bold text-white">
              PG
            </div>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{propertyName}</p>
            {themeToggle}
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => navigate("settings")}>
              <SettingsIcon className="size-4" />
            </Button>
          </header>

          {/* desktop header */}
          <header className="hidden items-center justify-between gap-4 border-b border-border/60 px-8 py-4 md:flex print:hidden">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{nav.label}</h2>
              <p className="text-sm text-muted-foreground">{nav.subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={sortAndFix} disabled={fixing}>
                <Wrench className={cn("size-4", fixing && "animate-pulse")} />
                {fixing ? "Fixing…" : "Sort & Fix"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => {
                  setView("dashboard");
                  setInsightsNonce((n) => n + 1);
                }}
              >
                <Sparkles className="size-4 text-emerald-600 dark:text-emerald-400" />
                AI Insights
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label="Refresh"
                onClick={() => setRefreshSignal((s) => s + 1)}
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </header>

          <main className="flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-6">
            {view === "dashboard" && <DashboardView insightsNonce={insightsNonce} refreshSignal={refreshSignal} />}
            {view === "rooms" && <RoomsView refreshSignal={refreshSignal} onTenantFocus={goToTenant} />}
            {view === "tenants" && (
              <TenantsView
                refreshSignal={refreshSignal}
                focusTenantId={focusTenantId}
                onClearFocus={() => setFocusTenantId(null)}
                property={me.settings?.property}
              />
            )}
            {view === "rent" && <RentView refreshSignal={refreshSignal} />}
            {view === "payments" && <PaymentsView refreshSignal={refreshSignal} property={me.settings?.property} />}
            {view === "expenses" && <ExpensesView refreshSignal={refreshSignal} />}
            {view === "issues" && <IssuesView refreshSignal={refreshSignal} />}
            {view === "import" && <ImportWizard onImported={() => setRefreshSignal((s) => s + 1)} onGoDashboard={() => navigate("dashboard")} />}
            {view === "reports" && <ReportsView refreshSignal={refreshSignal} />}
            {view === "settings" && <SettingsView me={me} reloadMe={reloadMe} />}
          </main>
        </div>
      </div>

      {/* ---------- mobile bottom nav ---------- */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden">
        {MOBILE_PRIMARY.map((key) => {
          const item = NAV.find((n) => n.key === key)!;
          const active = view === key;
          return (
            <button
              key={key}
              onClick={() => navigate(key)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] transition-colors",
                active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
              )}
            >
              <item.icon className="size-5" />
              {item.label}
            </button>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] transition-colors",
                !MOBILE_PRIMARY.includes(view) ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
              )}
            >
              <Menu className="size-5" />
              More
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto thin-scroll rounded-t-2xl px-4 pb-6 pt-2">
            <SheetHeader className="px-0 pb-2">
              <SheetTitle className="text-base">More</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-2">
              {NAV.filter((n) => !MOBILE_PRIMARY.includes(n.key)).map((item) => (
                <button
                  key={item.key}
                  onClick={() => navigate(item.key)}
                  className={cn(
                    "flex min-h-11 items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2.5 text-sm transition-colors hover:bg-muted",
                    view === item.key && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
              <button
                onClick={sortAndFix}
                disabled={fixing}
                className="flex min-h-11 items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2.5 text-sm transition-colors hover:bg-muted disabled:opacity-60"
              >
                <Wrench className="size-4 shrink-0" />
                {fixing ? "Fixing…" : "Sort & Fix"}
              </button>
              <button
                onClick={logout}
                className="flex min-h-11 items-center gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-700 transition-colors hover:bg-rose-500/20 dark:text-rose-400"
              >
                <LogOut className="size-4 shrink-0" />
                Sign out
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </nav>

      {/* ---------- footer ---------- */}
      <footer className="mt-auto border-t border-border/60 px-4 py-3 text-center text-xs text-muted-foreground print:hidden">
        PG Fund Manager · Built for Indian property owners · {monthLabel(todayYm(), true)}
      </footer>
    </div>
  );
}
