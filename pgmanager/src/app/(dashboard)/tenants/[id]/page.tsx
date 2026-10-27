"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, Phone, Mail, Calendar, IndianRupee, CreditCard,
  CheckCircle2, Clock, AlertTriangle, Minus, History, Tag, MoreHorizontal,
  User, MapPin, ChevronDown,
} from "lucide-react";
import { DropdownMenu, Collapsible } from "@/components/ui/dropdown-menu";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function daysSince(d: string | Date) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 30) return `${diff} days`;
  if (diff < 365) return `${Math.floor(diff / 30)} months`;
  return `${Math.floor(diff / 365)}y ${Math.floor((diff % 365) / 30)}m`;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  ACTIVE: { color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Active" },
  NOTICE_PERIOD: { color: "text-amber-500", bg: "bg-amber-500/10", label: "Notice Period" },
  CHECKED_OUT: { color: "text-muted-foreground", bg: "bg-muted", label: "Checked Out" },
  INACTIVE: { color: "text-red-500", bg: "bg-red-500/10", label: "Inactive" },
};

const RENT_STATUS: Record<string, { icon: any; color: string; badge: string }> = {
  PAID: { icon: CheckCircle2, color: "text-emerald-500", badge: "bg-emerald-500/10 text-emerald-600" },
  ADVANCE: { icon: CheckCircle2, color: "text-purple-500", badge: "bg-purple-500/10 text-purple-600" },
  PARTIAL: { icon: Minus, color: "text-amber-500", badge: "bg-amber-500/10 text-amber-600" },
  DUE: { icon: Clock, color: "text-blue-500", badge: "bg-blue-500/10 text-blue-600" },
  OVERDUE: { icon: AlertTriangle, color: "text-red-500", badge: "bg-red-500/10 text-red-600" },
};

const PAYMENT_METHODS: Record<string, string> = {
  UPI: "bg-purple-500/10 text-purple-600",
  BANK_TRANSFER: "bg-blue-500/10 text-blue-600",
  CASH: "bg-emerald-500/10 text-emerald-600",
  CARD: "bg-amber-500/10 text-amber-600",
  CHEQUE: "bg-orange-500/10 text-orange-600",
  OTHER: "bg-muted text-muted-foreground",
};

export default function TenantHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "payments" | "rent" | "activity">("overview");

  useEffect(() => {
    if (id) {
      fetch(`/api/tenants/${id}`).then((r) => r.json()).then(setTenant).catch(console.error).finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-32" />
        <div className="h-40 bg-muted rounded-xl" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!tenant || tenant.error) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Tenant not found</p>
        <button onClick={() => router.push("/tenants")} className="mt-4 text-primary text-sm hover:underline">← Back to tenants</button>
      </div>
    );
  }

  const summary = tenant._summary || {};
  const currentAssignment = tenant.assignments?.find((a: any) => a.isActive);
  const currentRR = currentAssignment?.rentRecords?.[0];
  const statusConfig = STATUS_CONFIG[tenant.status] || STATUS_CONFIG.ACTIVE;

  const tabs = [
    { id: "overview", label: "Overview", icon: User },
    { id: "payments", label: "Payments", icon: CreditCard, count: tenant.payments?.length || 0 },
    { id: "rent", label: "Rent", icon: IndianRupee },
    { id: "activity", label: "Activity", icon: History, count: tenant._auditLogs?.length || 0 },
  ] as const;

  return (
    <div className="space-y-5 max-w-[1200px]">
      {/* ─── Back + Actions ─── */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.push("/tenants")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Tenants
        </button>
        <DropdownMenu
          align="right"
          trigger={
            <button className="inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm hover:bg-muted transition-colors">
              <MoreHorizontal className="w-4 h-4" /> Actions
            </button>
          }
          items={[
            { label: "Record Payment", icon: <CreditCard className="w-4 h-4" />, onClick: () => router.push("/payments") },
            { label: "View Receipts", icon: <CheckCircle2 className="w-4 h-4" />, onClick: () => router.push("/receipts") },
            { divider: true, label: "", onClick: () => {} },
            { label: "Edit Tenant", icon: <User className="w-4 h-4" />, onClick: () => {} },
            ...(tenant.status === "ACTIVE" ? [{ label: "Move to Another Bed", icon: <MapPin className="w-4 h-4" />, onClick: () => router.push("/rooms") }] : []),
            ...(tenant.status === "ACTIVE" ? [{ label: "Check Out", icon: <AlertTriangle className="w-4 h-4" />, onClick: () => {}, danger: true }] : []),
          ]}
        />
      </div>

      {/* ─── Tenant Header (compact) ─── */}
      <div className="bg-card border rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-lg font-bold text-primary shrink-0">
            {tenant.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold">{tenant.name}</h1>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
              {currentAssignment && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Room {currentAssignment.bed.room.number} · Bed {currentAssignment.bed.number}
                </span>
              )}
              {tenant.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {tenant.phone}</span>}
              {tenant.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {tenant.email}</span>}
              {currentAssignment?.joiningDate && (
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {daysSince(currentAssignment.joiningDate)}</span>
              )}
            </div>
            {/* Aliases - only show if present, compact */}
            {tenant.aliases?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tenant.aliases.map((a: any) => (
                  <span key={a.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">
                    <Tag className="w-2.5 h-2.5" /> {a.alias}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Financial Summary (compact, collapsible) ─── */}
      <Collapsible title="Financial Summary" badge={currentRR ? currentRR.status : undefined}>
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Rent</p>
              <p className="text-lg font-bold mt-0.5">{fmt(summary.monthlyRent || 0)}</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Paid</p>
              <p className="text-lg font-bold mt-0.5 text-emerald-500">{fmt(summary.totalPaid || 0)}</p>
              <p className="text-[10px] text-muted-foreground">{summary.totalPayments || 0}×</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Outstanding</p>
              <p className={`text-lg font-bold mt-0.5 ${(summary.outstanding || 0) > 0 ? "text-red-500" : "text-emerald-500"}`}>
                {fmt(summary.outstanding || 0)}
              </p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Months</p>
              <p className="text-lg font-bold mt-0.5">{summary.paidMonths || 0}/{summary.totalMonths || 0}</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Deposit</p>
              <p className="text-lg font-bold mt-0.5">
                {currentAssignment?.securityDeposit ? fmt(Number(currentAssignment.securityDeposit)) : "—"}
              </p>
            </div>
          </div>
        </div>
      </Collapsible>

      {/* ─── Tabs ─── */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {"count" in tab && tab.count !== undefined && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-muted">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW ─── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <Collapsible title="Personal Details" defaultOpen>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  ["Full Name", tenant.name],
                  ["Phone", tenant.phone],
                  ["Email", tenant.email],
                  ["Emergency Contact", tenant.emergencyContact],
                  ["ID Type", tenant.idType],
                  ["ID Number", tenant.idNumber],
                  ["Due Date", currentAssignment?.dueDate ? `Every ${currentAssignment.dueDate}${getOrdinal(currentAssignment.dueDate)}` : null],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label as string}>
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <p className="text-sm font-medium">{value}</p>
                  </div>
                ))}
              </div>
              {tenant.notes && (
                <div className="mt-4 pt-3 border-t">
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <p className="text-sm mt-1">{tenant.notes}</p>
                </div>
              )}
            </div>
          </Collapsible>

          <Collapsible title="Recent Payments" count={Math.min(tenant.payments?.length || 0, 5)}>
            {tenant.payments?.length > 0 ? (
              <div className="divide-y">
                {tenant.payments.slice(0, 5).map((p: any) => (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{fmt(Number(p.amount))}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PAYMENT_METHODS[p.method] || PAYMENT_METHODS.OTHER}`}>
                          {p.method?.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{p.rentMonth} · {fmtDate(p.date)}</p>
                    </div>
                    {p.receiptNumber && <span className="text-[10px] text-muted-foreground font-mono shrink-0">{p.receiptNumber}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">No payments yet</div>
            )}
          </Collapsible>
        </div>
      )}

      {/* ─── PAYMENTS ─── */}
      {activeTab === "payments" && (
        <Collapsible title="Payment History" count={tenant.payments?.length || 0} defaultOpen>
          {tenant.payments?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b bg-muted/50">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Month</th>
                    <th className="px-4 py-2.5 font-medium">Method</th>
                    <th className="px-4 py-2.5 font-medium">Receipt</th>
                    <th className="px-4 py-2.5 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {tenant.payments.map((p: any) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5">{fmtDate(p.date)}</td>
                      <td className="px-4 py-2.5 font-bold text-emerald-500">{fmt(Number(p.amount))}</td>
                      <td className="px-4 py-2.5">{p.rentMonth}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_METHODS[p.method] || PAYMENT_METHODS.OTHER}`}>
                          {p.method?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.receiptNumber || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-[150px]">{p.transactionId || p.bankReference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">No payments recorded</div>
          )}
        </Collapsible>
      )}

      {/* ─── RENT LEDGER ─── */}
      {activeTab === "rent" && (
        <div className="space-y-4">
          {currentAssignment?.rentRecords?.length > 0 ? (
            <>
              <Collapsible title="Rent Summary" defaultOpen>
                <div className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ["Monthly Rent", fmt(summary.monthlyRent), ""],
                      ["Paid Months", `${summary.paidMonths}/${summary.totalMonths}`, "text-emerald-500"],
                      ["Total Due", fmt(summary.monthlyRent * summary.totalMonths), ""],
                      ["Total Paid", fmt(summary.totalPaid), "text-emerald-500"],
                    ].map(([label, value, cls]) => (
                      <div key={label as string} className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                        <p className={`text-base font-bold mt-0.5 ${cls}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Collapsible>

              <Collapsible title="Month-by-Month Ledger" count={currentAssignment.rentRecords.length} defaultOpen>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b bg-muted/50">
                        <th className="px-4 py-2.5 font-medium">Month</th>
                        <th className="px-4 py-2.5 font-medium">Due</th>
                        <th className="px-4 py-2.5 font-medium">Paid</th>
                        <th className="px-4 py-2.5 font-medium">Remaining</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentAssignment.rentRecords.map((rr: any) => {
                        const remaining = Number(rr.rentDue) - Number(rr.amountPaid);
                        const rs = RENT_STATUS[rr.status] || RENT_STATUS.DUE;
                        return (
                          <tr key={rr.id} className={`border-b last:border-0 hover:bg-muted/30 ${rr.status === "OVERDUE" ? "bg-red-500/5" : ""}`}>
                            <td className="px-4 py-2.5 font-medium">{monthLabel(rr.month)}</td>
                            <td className="px-4 py-2.5">{fmt(Number(rr.rentDue))}</td>
                            <td className="px-4 py-2.5 font-medium text-emerald-500">{fmt(Number(rr.amountPaid))}</td>
                            <td className={`px-4 py-2.5 font-medium ${remaining > 0 ? "text-red-500" : ""}`}>
                              {remaining > 0 ? fmt(remaining) : "—"}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${rs.badge}`}>
                                <rs.icon className="w-3 h-3" /> {rr.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Collapsible>
            </>
          ) : (
            <div className="bg-card border rounded-xl p-8 text-center text-muted-foreground">No rent records found</div>
          )}
        </div>
      )}

      {/* ─── ACTIVITY ─── */}
      {activeTab === "activity" && (
        <Collapsible title="Activity Log" count={tenant._auditLogs?.length || 0} defaultOpen>
          {tenant._auditLogs?.length > 0 ? (
            <div className="divide-y">
              {tenant._auditLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 px-5 py-2.5">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <History className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        log.action === "CREATE" ? "bg-emerald-500/10 text-emerald-600" :
                        log.action === "UPDATE" ? "bg-blue-500/10 text-blue-600" :
                        log.action === "DELETE" ? "bg-red-500/10 text-red-600" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {log.action}
                      </span>
                      <span className="text-xs text-muted-foreground">by {log.user}</span>
                    </div>
                    {log.newValue && <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.newValue}</p>}
                    <p className="text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString("en-IN")}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">No activity yet</div>
          )}
        </Collapsible>
      )}
    </div>
  );
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
