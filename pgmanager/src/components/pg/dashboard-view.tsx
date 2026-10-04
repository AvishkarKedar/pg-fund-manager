"use client";

import { useEffect, useRef, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowDownRight, ArrowUpRight, BedDouble, CalendarDays, MessageCircle,
  Phone, PiggyBank, ReceiptIndianRupee, Sparkles, TrendingDown, Users, Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { api, useApi, useSignalReload } from "@/hooks/pg/useApi";
import type { DashboardResponse, InsightsResponse } from "@/lib/client";
import { fmtINR, RENT_REMINDER, timeAgo, todayYm, waLink, telLink, monthLabel } from "@/lib/client";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, KpiCard, Money, MonthNav, PageHeader, SectionLabel, StatusBadge } from "@/components/pg/bits";

const DONUT_COLORS = ["#10b981", "#f59e0b", "#14b8a6", "#84cc16", "#fb923c", "#78716c", "#0d9488", "#a16207", "#a3a3a3", "#57534e"];

export function DashboardView({ insightsNonce, refreshSignal }: { insightsNonce: number; refreshSignal: number }) {
  const [month, setMonth] = useState(todayYm());
  const { data, error, loading, reload } = useApi<DashboardResponse>(`/api/dashboard?month=${month}`);
  useSignalReload(refreshSignal, reload);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Overview for ${monthLabel(month, true)}`}
        actions={<MonthNav month={month} onChange={setMonth} />}
      />
      {loading && !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="rounded-xl"><CardContent className="p-5">
                <Skeleton className="h-4 w-20" /><Skeleton className="mt-3 h-8 w-28" /><Skeleton className="mt-3 h-1.5 w-full" />
              </CardContent></Card>
            ))}
          </div>
          <Card className="rounded-xl"><CardContent className="p-6"><Skeleton className="h-56 w-full" /></CardContent></Card>
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <DashboardBody data={data} insightsNonce={insightsNonce} />
      ) : null}
    </div>
  );
}

function DashboardBody({ data, insightsNonce }: { data: DashboardResponse; insightsNonce: number }) {
  const s = data.stats;
  const unpaidCount = (data.rentStatus.PARTIAL ?? 0) + (data.rentStatus.DUE ?? 0) + (data.rentStatus.OVERDUE ?? 0);
  const collectRate = s.expectedRent > 0 ? Math.round((s.collected / s.expectedRent) * 100) : 0;
  const profitable = s.netIncome >= 0;
  const monthName = monthLabel(data.month, true);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Wallet}
          label="Collected"
          value={fmtINR(s.collected)}
          sub={<>of {fmtINR(s.expectedRent)} expected · {collectRate}%</>}
          tone="emerald"
          progress={collectRate}
        />
        <KpiCard
          icon={ReceiptIndianRupee}
          label="Pending"
          value={fmtINR(s.pending)}
          sub={unpaidCount > 0 ? `${unpaidCount} unpaid tenant${unpaidCount > 1 ? "s" : ""}` : "All settled"}
          tone={s.pending > 0 ? "amber" : "emerald"}
          progress={s.expectedRent > 0 ? (s.pending / s.expectedRent) * 100 : 0}
        />
        <KpiCard
          icon={BedDouble}
          label="Occupancy"
          value={`${s.occupiedBeds}/${s.totalBeds}`}
          sub={`${s.occupancyRate}% of beds filled · ${s.activeTenants} active tenants`}
          tone="neutral"
          progress={s.occupancyRate}
        />
        <KpiCard
          icon={TrendingDown}
          label="Net income"
          value={<span className={profitable ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{fmtINR(s.netIncome)}</span>}
          sub={`${fmtINR(s.collected)} collected − ${fmtINR(s.expensesThisMonth)} expenses`}
          tone={profitable ? "emerald" : "rose"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* collections vs expenses chart */}
        <Card className="rounded-xl border-border/60 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Collections vs expenses</CardTitle>
            <p className="text-xs text-muted-foreground">Last 6 months</p>
          </CardHeader>
          <CardContent className="h-64 px-2 pb-4 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlySeries} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="gCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} stroke="currentColor" className="text-muted-foreground" />
                <YAxis
                  tickLine={false} axisLine={false} width={58} tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground"
                  tickFormatter={(v: number) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                />
                <Tooltip
                  formatter={(value: number | string, name: string) => [fmtINR(Number(value)), name === "collected" ? "Collected" : "Expenses"]}
                  labelClassName="font-medium"
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }}
                />
                <Area type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2} fill="url(#gCollected)" />
                <Area type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={2} fill="url(#gExpenses)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* rent status */}
        <RentStatusCard data={data} />

        {/* who owes rent */}
        <Card className="rounded-xl border-border/60 shadow-sm">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Who owes rent</CardTitle>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              {data.debtors.length}
            </span>
          </CardHeader>
          <CardContent className="pt-0">
            {data.debtors.length === 0 ? (
              <EmptyState icon={Users} title="Everyone has paid" hint={`No outstanding rent for ${monthName}.`} className="py-8" />
            ) : (
              <ul className="thin-scroll max-h-72 space-y-1 overflow-y-auto pr-1">
                {data.debtors.map((d) => (
                  <li key={d.tenantId} className="flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Room {d.room} · Bed {d.bed}
                      </p>
                    </div>
                    <Money value={d.outstanding} className="text-sm text-rose-600 dark:text-rose-400" />
                    <StatusBadge status={d.status} />
                    <div className="flex items-center gap-0.5">
                      {d.phone && (
                        <>
                          <a href={telLink(d.phone)} aria-label={`Call ${d.name}`} className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                            <Phone className="size-3.5" />
                          </a>
                          <a
                            href={waLink(d.phone, RENT_REMINDER(d.name, d.outstanding, data.month))}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`WhatsApp ${d.name}`}
                            className="flex size-8 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                          >
                            <MessageCircle className="size-3.5" />
                          </a>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* expense breakdown */}
        <ExpenseBreakdownCard data={data} />

        {/* AI insights */}
        <InsightsCard nonce={insightsNonce} />

        {/* recent activity */}
        <Card className="rounded-xl border-border/60 shadow-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent activity</CardTitle>
            <p className="text-xs text-muted-foreground">Payments &amp; expenses</p>
          </CardHeader>
          <CardContent className="pt-0">
            {data.recentActivity.length === 0 ? (
              <EmptyState icon={CalendarDays} title="No recent activity" hint="Payments and expenses will appear here." className="py-8" />
            ) : (
              <ul className="thin-scroll max-h-72 space-y-1 overflow-y-auto pr-1">
                {data.recentActivity.map((a) => {
                  const isPayment = a.type === "PAYMENT";
                  return (
                    <li key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg",
                          isPayment ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        )}
                      >
                        {isPayment ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-sm">{a.text}</p>
                      <Money
                        value={isPayment ? a.amount : -a.amount}
                        signed
                        className={cn("text-sm", isPayment ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}
                      />
                      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{timeAgo(a.at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* occupancy by floor */}
        <Card className="rounded-xl border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Occupancy by floor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {data.occupancyByFloor.length === 0 ? (
              <EmptyState icon={BedDouble} title="No rooms yet" hint="Add rooms to see occupancy." className="py-8" />
            ) : (
              data.occupancyByFloor.map((f) => {
                const pct = f.total > 0 ? Math.round((f.occupied / f.total) * 100) : 0;
                return (
                  <div key={f.floor}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium">Floor {f.floor}</span>
                      <span className="text-muted-foreground tabular-nums">{f.occupied}/{f.total}</span>
                    </div>
                    <Progress value={pct} className="h-2 [&>div]:bg-emerald-500" />
                  </div>
                );
              })
            )}
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/5 px-3 py-2 text-xs text-muted-foreground">
              <PiggyBank className="size-4 text-emerald-600 dark:text-emerald-400" />
              {s.vacantBeds} vacant bed{s.vacantBeds === 1 ? "" : "s"} across the property
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RentStatusCard({ data }: { data: DashboardResponse }) {
  const rs = data.rentStatus;
  const total = (rs.PAID ?? 0) + (rs.PARTIAL ?? 0) + (rs.DUE ?? 0) + (rs.OVERDUE ?? 0);
  const segments = [
    { key: "PAID", count: rs.PAID ?? 0, cls: "bg-emerald-500", amount: data.stats.collected },
    { key: "PARTIAL", count: rs.PARTIAL ?? 0, cls: "bg-amber-500", amount: null },
    { key: "DUE", count: rs.DUE ?? 0, cls: "bg-slate-400 dark:bg-slate-500", amount: null },
    { key: "OVERDUE", count: rs.OVERDUE ?? 0, cls: "bg-rose-500", amount: data.stats.overdueAmount },
  ];
  return (
    <Card className="rounded-xl border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Rent status</CardTitle>
        <p className="text-xs text-muted-foreground">{monthLabel(data.month, true)}</p>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {total === 0 ? (
          <EmptyState icon={ReceiptIndianRupee} title="No invoices this month" hint="Invoices appear once tenants are assigned beds." className="py-8" />
        ) : (
          <>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              {segments.map((seg) =>
                seg.count > 0 ? (
                  <div key={seg.key} className={cn(seg.cls, "transition-all")} style={{ width: `${(seg.count / total) * 100}%` }} />
                ) : null
              )}
            </div>
            <ul className="space-y-2.5">
              {segments.map((seg) => (
                <li key={seg.key} className="flex items-center gap-2 text-sm">
                  <span className={cn("size-2.5 rounded-full", seg.cls)} />
                  <StatusBadge status={seg.key} />
                  <span className="ml-auto tabular-nums text-muted-foreground">{seg.count}</span>
                  {seg.amount !== null && <Money value={seg.amount} muted className="min-w-20 text-right text-xs" />}
                </li>
              ))}
            </ul>
            <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Expected {fmtINR(data.stats.expectedRent)} · Collected {fmtINR(data.stats.collected)}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ExpenseBreakdownCard({ data }: { data: DashboardResponse }) {
  const top3 = data.expenseBreakdown.slice(0, 3);
  return (
    <Card className="rounded-xl border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Expense breakdown</CardTitle>
        <p className="text-xs text-muted-foreground">{monthLabel(data.month, true)}</p>
      </CardHeader>
      <CardContent className="pt-0">
        {data.expenseBreakdown.length === 0 ? (
          <EmptyState icon={TrendingDown} title="No expenses logged" hint="Log expenses to see the breakdown." className="py-8" />
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="h-36 w-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.expenseBreakdown} dataKey="amount" nameKey="category" innerRadius={40} outerRadius={62} paddingAngle={2} strokeWidth={0}>
                    {data.expenseBreakdown.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number | string) => fmtINR(Number(v))}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-full space-y-1.5">
              {top3.map((e, i) => (
                <li key={e.category} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                  <span className="flex-1 truncate">{e.category.charAt(0) + e.category.slice(1).toLowerCase()}</span>
                  <Money value={e.amount} className="text-sm" />
                </li>
              ))}
              {data.expenseBreakdown.length > 3 && (
                <li className="text-xs text-muted-foreground">+{data.expenseBreakdown.length - 3} more categories</li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InsightsCard({ nonce }: { nonce: number }) {
  const [result, setResult] = useState<InsightsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef(true);

  async function generate() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api<InsightsResponse>("/api/insights", { method: "GET" });
      setResult(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate insights");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    generate();
  }, [nonce]);

  return (
    <Card className="rounded-xl border-border/60 shadow-sm">
      <CardHeader className="flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">AI insights</CardTitle>
          {result && (
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              result.source === "ai" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"
            )}>
              {result.source === "ai" ? "AI" : "Computed"}
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={generate} disabled={busy}>
          <Sparkles className={cn("size-3.5 text-emerald-600 dark:text-emerald-400", busy && "animate-pulse")} />
          {result ? "Regenerate" : "Generate insights"}
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {busy && !result ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-4 w-full animate-pulse" />)}
            <Skeleton className="h-12 w-full animate-pulse" />
          </div>
        ) : result ? (
          <div className="space-y-3">
            <ul className="space-y-2">
              {result.insights.insights.map((ins, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span>{ins}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5">
              <SectionLabel className="text-emerald-700 dark:text-emerald-400">Recommendation</SectionLabel>
              <p className="mt-1 text-sm">{result.insights.recommendation}</p>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="Insights on demand"
            hint="Generate a quick read on collections, debtors and expenses for this month."
            className="py-8"
          />
        )}
      </CardContent>
    </Card>
  );
}
