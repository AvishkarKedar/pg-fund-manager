"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  IndianRupee, CheckCircle2, Clock, AlertTriangle, Minus,
  ChevronLeft, ChevronRight, Filter, Download, Zap,
  Phone, Receipt, ArrowUpRight, TrendingUp, Users,
  CreditCard, Banknote, Search, X, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";
import { exportPaymentsToCSV } from "@/lib/export";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

const STATUS_CONFIG: Record<string, { icon: any; color: string; badge: string; bg: string }> = {
  PAID: { icon: CheckCircle2, color: "text-emerald-500", badge: "bg-emerald-500/10 text-emerald-600", bg: "bg-emerald-500" },
  ADVANCE: { icon: CheckCircle2, color: "text-purple-500", badge: "bg-purple-500/10 text-purple-600", bg: "bg-purple-500" },
  PARTIAL: { icon: Minus, color: "text-amber-500", badge: "bg-amber-500/10 text-amber-600", bg: "bg-amber-500" },
  DUE: { icon: Clock, color: "text-blue-500", badge: "bg-blue-500/10 text-blue-600", bg: "bg-blue-500" },
  OVERDUE: { icon: AlertTriangle, color: "text-red-500", badge: "bg-red-500/10 text-red-600", bg: "bg-red-500" },
};

type FilterType = "all" | "PAID" | "PARTIAL" | "DUE" | "OVERDUE";

export default function RentPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payingLoading, setPayingLoading] = useState(false);
  const [payMethod, setPayMethod] = useState("CASH");

  const loadRent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rent?month=${selectedMonth}`);
      const d = await res.json();
      setData(d);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedMonth]);

  useEffect(() => { loadRent(); }, [loadRent]);

  async function quickPay(tenantId: string) {
    setPayingLoading(true);
    try {
      const res = await fetch("/api/rent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, month: selectedMonth, method: payMethod }),
      });
      const result = await res.json();
      if (result.ok) {
        setPayingId(null);
        loadRent(); // Reload data
      }
    } catch (e) { console.error(e); }
    finally { setPayingLoading(false); }
  }

  function navigateMonth(delta: number) {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  if (loading && !data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted rounded-xl" />)}
        </div>
        <div className="h-80 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-20 text-muted-foreground">Could not load rent data</div>;
  }

  const { summary: s, tenantRent, monthHistory, recentPayments } = data;

  // Filter tenants
  const filtered = tenantRent?.filter((t: any) => {
    if (filter !== "all" && t.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.tenantName.toLowerCase().includes(q) || t.roomNumber?.toLowerCase().includes(q) || t.bedNumber?.toLowerCase().includes(q);
    }
    return true;
  }) || [];

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* ─── Header with Month Navigator ────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Rent Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track and collect rent for each month</p>
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-2">
          <button onClick={() => navigateMonth(-1)}
            className="w-9 h-9 rounded-lg border flex items-center justify-center hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center min-w-[140px]">
            <p className="text-sm font-bold">{data.monthLabel}</p>
          </div>
          <button onClick={() => navigateMonth(1)}
            className="w-9 h-9 rounded-lg border flex items-center justify-center hover:bg-muted transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setSelectedMonth(new Date().toISOString().slice(0, 7))}
            className="ml-1 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted transition-colors">
            Today
          </button>
        </div>
      </div>

      {/* ─── Collection Progress Bar ─────────────────────────── */}
      <div className="bg-card border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-sm">Collection Progress</h2>
            <p className="text-xs text-muted-foreground">{s.paidCount} of {s.totalTenants} tenants paid</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{s.collectionRate}%</p>
            <p className="text-xs text-muted-foreground">{fmt(s.totalCollected)} of {fmt(s.totalExpected)}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-5 bg-muted rounded-full overflow-hidden flex">
          {s.paidCount > 0 && (
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(s.paidCount / s.totalTenants) * 100}%` }} />
          )}
          {s.partialCount > 0 && (
            <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${(s.partialCount / s.totalTenants) * 100}%` }} />
          )}
          {s.dueCount > 0 && (
            <div className="h-full bg-blue-500/50 transition-all duration-500" style={{ width: `${(s.dueCount / s.totalTenants) * 100}%` }} />
          )}
          {s.overdueCount > 0 && (
            <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${(s.overdueCount / s.totalTenants) * 100}%` }} />
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-3">
          {[
            { label: "Paid", count: s.paidCount, color: "bg-emerald-500", amount: s.totalCollected },
            { label: "Partial", count: s.partialCount, color: "bg-amber-500" },
            { label: "Due", count: s.dueCount, color: "bg-blue-500/50" },
            { label: "Overdue", count: s.overdueCount, color: "bg-red-500", amount: s.totalOutstanding },
          ].filter(l => l.count > 0).map(l => (
            <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />
              {l.label}: {l.count}{l.amount ? ` (${fmt(l.amount)})` : ""}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Summary Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <IndianRupee className="w-3.5 h-3.5 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">Expected</p>
          </div>
          <p className="text-xl font-bold">{fmt(s.totalExpected)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{s.totalTenants} tenants × rent</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <p className="text-xs text-muted-foreground">Collected</p>
          </div>
          <p className="text-xl font-bold text-emerald-500">{fmt(s.totalCollected)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{s.paidCount} fully paid</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
          <p className="text-xl font-bold text-amber-500">{fmt(s.totalExpected - s.totalCollected - s.totalOutstanding)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{s.partialCount + s.dueCount} awaiting</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            </div>
            <p className="text-xs text-muted-foreground">Overdue</p>
          </div>
          <p className={`text-xl font-bold ${s.overdueCount > 0 ? "text-red-500" : "text-muted-foreground"}`}>{fmt(s.totalOutstanding)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{s.overdueCount} overdue</p>
        </div>
      </div>

      {/* ─── Month History Chart ────────────────────────────── */}
      <div className="bg-card border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-4">Collection Trend (Last 6 Months)</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={monthHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={60} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(value) => fmt(Number(value ?? 0))}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
            />
            <Bar dataKey="expected" name="Expected" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="collected" name="Collected" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ─── Filter Tabs + Search ──────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "OVERDUE", "DUE", "PARTIAL", "PAID"] as FilterType[]).map((f) => {
            const count = f === "all" ? s.totalTenants : tenantRent?.filter((t: any) => t.status === f).length || 0;
            const config = f !== "all" ? STATUS_CONFIG[f] : null;
            return (
              <button key={f} onClick={() => setFilter(f)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  filter === f ? "bg-primary/10 border-primary/30 text-primary" : "bg-card hover:bg-muted"
                }`}>
                {config && <config.icon className="w-3 h-3" />}
                {f === "all" ? "All" : f}
                <span className="px-1 py-0.5 rounded text-[10px] bg-muted">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tenant…"
              className="pl-8 pr-3 py-1.5 border rounded-lg bg-background text-xs w-40 focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <button onClick={() => exportPaymentsToCSV(recentPayments || [])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs text-muted-foreground hover:bg-muted">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* ─── Rent Table ────────────────────────────────────── */}
      <div className="bg-card border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {filter !== "all" ? `No ${filter.toLowerCase()} tenants this month` : "No tenants with active assignments"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b bg-muted/50">
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Bed</th>
                  <th className="px-4 py-3 font-medium text-right">Rent</th>
                  <th className="px-4 py-3 font-medium text-right">Paid</th>
                  <th className="px-4 py-3 font-medium text-right">Remaining</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t: any) => {
                  const config = STATUS_CONFIG[t.status] || STATUS_CONFIG.DUE;
                  const isPaying = payingId === t.tenantId;

                  return (
                    <tr key={t.tenantId} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${
                      t.status === "OVERDUE" ? "bg-red-500/[0.02]" : ""
                    }`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {t.tenantName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                          </div>
                          <div>
                            <button onClick={() => router.push(`/tenants/${t.tenantId}`)}
                              className="text-sm font-medium hover:text-primary hover:underline text-left">
                              {t.tenantName}
                            </button>
                            {t.phone && (
                              <p className="text-[10px] text-muted-foreground">{t.phone}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        Room {t.roomNumber} · Bed {t.bedNumber}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(t.monthlyRent)}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-500">{fmt(t.paid)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${t.remaining > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                        {t.remaining > 0 ? fmt(t.remaining) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.badge}`}>
                          <config.icon className="w-3 h-3" />
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {t.status !== "PAID" && t.status !== "ADVANCE" && (
                          <div className="flex items-center justify-end gap-2">
                            {isPaying ? (
                              <div className="flex items-center gap-1.5">
                                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                                  className="px-2 py-1 border rounded text-xs bg-background">
                                  <option value="CASH">Cash</option>
                                  <option value="UPI">UPI</option>
                                  <option value="BANK_TRANSFER">Bank</option>
                                </select>
                                <button onClick={() => quickPay(t.tenantId)} disabled={payingLoading}
                                  className="px-2.5 py-1 bg-emerald-500 text-white rounded text-xs font-medium hover:bg-emerald-600 disabled:opacity-50">
                                  {payingLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
                                </button>
                                <button onClick={() => setPayingId(null)}
                                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => { setPayingId(t.tenantId); setPayMethod("CASH"); }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs font-medium hover:bg-emerald-500/20 transition-colors">
                                <Zap className="w-3 h-3" /> Pay
                              </button>
                            )}
                            <button onClick={() => router.push(`/tenants/${t.tenantId}`)}
                              className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                              <Receipt className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {t.status === "PAID" && (
                          <span className="text-xs text-emerald-500">✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Recent Payments This Month ───────────────────── */}
      {recentPayments?.length > 0 && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">Payments This Month</h3>
            <span className="text-xs text-muted-foreground">{recentPayments.length} payments</span>
          </div>
          <div className="divide-y max-h-[300px] overflow-y-auto">
            {recentPayments.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{p.tenantName}</p>
                  <p className="text-xs text-muted-foreground">{p.method?.replace("_", " ")} · {p.receiptNumber || "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-emerald-500">+{fmt(p.amount)}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
