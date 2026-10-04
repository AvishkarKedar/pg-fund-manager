"use client";

import { useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, ChevronDown, CreditCard, Download, Percent, TrendingDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, useSignalReload } from "@/hooks/pg/useApi";
import type { ReportsResponse } from "@/lib/client";
import { fmtINR, monthLabel, todayYm } from "@/lib/client";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, KpiCard, Money, MonthNav, PageHeader, StatusBadge } from "@/components/pg/bits";

const DONUT_COLORS = ["#10b981", "#f59e0b", "#14b8a6", "#84cc16", "#fb923c", "#78716c", "#0d9488", "#a16207", "#a3a3a3", "#57534e"];

export function ReportsView({ refreshSignal }: { refreshSignal: number }) {
  const [month, setMonth] = useState(todayYm());
  const { data, error, loading, reload } = useApi<ReportsResponse>(`/api/reports?month=${month}`);
  useSignalReload(refreshSignal, reload);

  const exports = [
    { label: "Ledger", type: "ledger" },
    { label: "Payments", type: "payments" },
    { label: "Expenses", type: "expenses" },
    { label: "Tenants", type: "tenants" },
  ];

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={data ? `Monthly analytics · ${monthLabel(month, true)}` : "Monthly analytics"}
        actions={
          <>
            <MonthNav month={month} onChange={setMonth} showReset />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <Download className="size-4" /> Export
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {exports.map((x) => (
                  <DropdownMenuItem
                    key={x.type}
                    onClick={() => (window.location.href = `/api/reports/export?type=${x.type}&month=${month}`)}
                  >
                    <Download className="size-4" /> {x.label} CSV
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {loading && !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <div className="space-y-6">
          {/* headline cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={Percent}
              label="Collection rate"
              value={<span className={data.collections.collectionRate >= 90 ? "text-emerald-600 dark:text-emerald-400" : data.collections.collectionRate >= 70 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}>{data.collections.collectionRate}%</span>}
              sub={`${data.collections.paid} paid · ${data.collections.partial} partial · ${data.collections.overdue} overdue`}
              tone="emerald"
              progress={data.collections.collectionRate}
            />
            <KpiCard icon={Wallet} label="Collected" value={fmtINR(data.collections.collected)} sub={`of ${fmtINR(data.collections.expected)} expected`} tone="emerald" />
            <KpiCard icon={TrendingDown} label="Expenses" value={fmtINR(data.expenses.total)} sub={`${data.expenses.byCategory.length} categories`} tone="rose" />
            <KpiCard
              icon={BarChart3}
              label="Net profit"
              value={<span className={data.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{fmtINR(data.profit)}</span>}
              sub={`margin ${data.collections.collected > 0 ? Math.round((data.profit / data.collections.collected) * 100) : 0}% of collections`}
              tone={data.profit >= 0 ? "emerald" : "rose"}
            />
          </div>

          {/* 12 month chart */}
          <Card className="rounded-xl border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">12-month performance</CardTitle>
              <p className="text-xs text-muted-foreground">Collections, expenses and profit</p>
            </CardHeader>
            <CardContent className="h-72 px-2 pb-4 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.yearSeries} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border/60" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                  <YAxis
                    tickLine={false} axisLine={false} width={58} tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground"
                    domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.1)]}
                    tickFormatter={(v: number) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />
                  <Tooltip
                    formatter={(value: number | string, name: string) => [fmtINR(Number(value)), name]}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12, lineHeight: "16px" }} />
                  <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={26} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#f43f5e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="profit" name="Profit" stroke="#0d9488" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* expense breakdown */}
            <Card className="rounded-xl border-border/60 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Expense breakdown</CardTitle>
                <p className="text-xs text-muted-foreground">{monthLabel(month, true)}</p>
              </CardHeader>
              <CardContent className="pt-0">
                {data.expenses.byCategory.length === 0 ? (
                  <EmptyState icon={TrendingDown} title="No expenses this month" className="py-8" />
                ) : (
                  <div className="flex flex-col items-center gap-4 sm:flex-row">
                    <div className="h-36 w-36 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={data.expenses.byCategory} dataKey="amount" nameKey="category" innerRadius={40} outerRadius={62} paddingAngle={2} strokeWidth={0}>
                            {data.expenses.byCategory.map((_, i) => (
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
                    <ul className="thin-scroll max-h-36 w-full space-y-1.5 overflow-y-auto pr-1">
                      {data.expenses.byCategory.map((e, i) => (
                        <li key={e.category} className="flex items-center gap-2 text-sm">
                          <span className="size-2.5 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                          <span className="flex-1 truncate">{e.category.charAt(0) + e.category.slice(1).toLowerCase()}</span>
                          <Money value={e.amount} className="text-sm" />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* debtor aging */}
            <Card className="rounded-xl border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Debtor aging</CardTitle>
                <p className="text-xs text-muted-foreground">Outstanding by invoice age</p>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {(["0-30d", "31-60d", "60d+"] as const).map((bucket) => {
                  const amount = data.aging[bucket] ?? 0;
                  const max = Math.max(1, ...Object.values(data.aging));
                  return (
                    <div key={bucket}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium">{bucket}</span>
                        <Money value={amount} className="text-xs" />
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", bucket === "0-30d" ? "bg-amber-500" : bucket === "31-60d" ? "bg-orange-500" : "bg-rose-500")}
                          style={{ width: `${(amount / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Total outstanding: {fmtINR(data.collections.pending)} across {data.debtors.length} debtor{data.debtors.length === 1 ? "" : "s"}
                </div>
              </CardContent>
            </Card>

            {/* payment methods */}
            <Card className="rounded-xl border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Payment methods</CardTitle>
                <p className="text-xs text-muted-foreground">{monthLabel(month, true)}</p>
              </CardHeader>
              <CardContent className="pt-0">
                {data.methodSplit.length === 0 ? (
                  <EmptyState icon={CreditCard} title="No payments this month" className="py-8" />
                ) : (
                  <ul className="space-y-3">
                    {data.methodSplit.map((m) => {
                      const max = Math.max(...data.methodSplit.map((x) => x.amount));
                      return (
                        <li key={m.method}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-medium">{m.method}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {m.count} × · {fmtINR(m.amount)}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(m.amount / max) * 100}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* outstanding dues table */}
          <Card className="rounded-xl border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Outstanding dues</CardTitle>
              <p className="text-xs text-muted-foreground">Top {Math.min(15, data.debtors.length)} open invoices across all months</p>
            </CardHeader>
            <CardContent className="pt-0">
              {data.debtors.length === 0 ? (
                <EmptyState icon={Wallet} title="No outstanding dues" hint="Every invoice across every month is settled." className="py-8" />
              ) : (
                <div className="thin-scroll overflow-x-auto">
                  <Table className="min-w-[560px] text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tenant</TableHead>
                        <TableHead>Room</TableHead>
                        <TableHead>Invoice month</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.debtors.map((d, i) => (
                        <TableRow key={`${d.name}-${d.period}-${i}`} className="odd:bg-muted/30 hover:bg-muted/50">
                          <TableCell className="font-medium">{d.name}</TableCell>
                          <TableCell className="text-muted-foreground">{d.room}</TableCell>
                          <TableCell className="text-muted-foreground">{monthLabel(d.period, true)}</TableCell>
                          <TableCell><StatusBadge status={d.status} /></TableCell>
                          <TableCell className="text-right">
                            <Money value={d.outstanding} className="text-rose-600 dark:text-rose-400" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
