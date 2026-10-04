"use client";

import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtINR, monthLabel, todayIsoDate, type PropertySettings } from "@/lib/client";

export interface StatementRow {
  room: string;
  bed: string;
  name: string;
  /** ISO date the period falls due */
  dueDate: string | null;
  due: number;
  paid: number;
  outstanding: number;
  method: string | null;
  /** ISO date the invoice was settled (null while unpaid) */
  paidOn: string | null;
}

export interface StatementData {
  /** "YYYY-MM" — the month being stated */
  month: string;
  rows: StatementRow[];
  property: PropertySettings | null;
}

/** Printable monthly rent statement for the whole roll. Print CSS hides everything but #print-root. */
export function StatementPrintDialog({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: StatementData | null;
}) {
  if (!open || !data) return null;
  const p = data.property ?? {};

  const totalDue = data.rows.reduce((s, r) => s + r.due, 0);
  const totalPaid = data.rows.reduce((s, r) => s + r.paid, 0);
  const totalOutstanding = data.rows.reduce((s, r) => s + r.outstanding, 0);
  const rate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:bg-transparent print:p-0">
      <div className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto thin-scroll rounded-xl bg-background shadow-xl print:overflow-visible print:rounded-none print:shadow-none">
        {/* screen-only toolbar */}
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3 print:hidden">
          <p className="text-sm font-semibold">Monthly statement — {monthLabel(data.month, true)}</p>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={onClose}>
              <X className="size-4" /> Close
            </Button>
          </div>
        </div>

        {/* the statement itself — the only thing visible when printing */}
        <div id="print-root" className="mx-auto bg-white p-8 text-slate-900 print:p-2">
          <div className="border-b-2 border-emerald-600 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{p.name || "PG"}</h2>
                {p.address && <p className="mt-0.5 max-w-xs text-xs text-slate-600">{p.address}</p>}
                {p.phone && <p className="text-xs text-slate-600">Phone: {p.phone}</p>}
              </div>
              <div className="text-right">
                <p className="text-sm font-bold uppercase tracking-widest text-emerald-700">Monthly Rent Statement</p>
                <p className="mt-1 text-sm font-semibold">{monthLabel(data.month, true)}</p>
                <p className="text-xs text-slate-600">Generated {fmtDate(todayIsoDate())}</p>
              </div>
            </div>
          </div>

          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2 font-semibold">Room·Bed</th>
                <th className="py-2 pr-2 font-semibold">Tenant</th>
                <th className="py-2 pr-2 font-semibold">Due date</th>
                <th className="py-2 pr-2 text-right font-semibold">Due</th>
                <th className="py-2 pr-2 text-right font-semibold">Paid</th>
                <th className="py-2 pr-2 text-right font-semibold">Outstanding</th>
                <th className="py-2 pr-2 font-semibold">Method</th>
                <th className="py-2 text-right font-semibold">Paid on</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={`${r.room}-${r.bed}-${i}`} className="border-b border-slate-200">
                  <td className="whitespace-nowrap py-2 pr-2 font-medium">
                    {r.room}·{r.bed}
                  </td>
                  <td className="py-2 pr-2">{r.name}</td>
                  <td className="whitespace-nowrap py-2 pr-2 text-slate-600">{fmtDate(r.dueDate)}</td>
                  <td className="whitespace-nowrap py-2 pr-2 text-right tabular-nums">{fmtINR(r.due)}</td>
                  <td className="whitespace-nowrap py-2 pr-2 text-right tabular-nums">{fmtINR(r.paid)}</td>
                  <td className={`whitespace-nowrap py-2 pr-2 text-right tabular-nums ${r.outstanding > 0 ? "font-semibold" : "text-slate-500"}`}>
                    {fmtINR(r.outstanding)}
                  </td>
                  <td className="py-2 pr-2 text-slate-600">{r.method ?? "—"}</td>
                  <td className="whitespace-nowrap py-2 text-right text-slate-600">{r.paidOn ? fmtDate(r.paidOn) : "—"}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300">
                <td colSpan={3} className="py-2 pr-2 font-semibold">Total — {data.rows.length} invoice{data.rows.length === 1 ? "" : "s"}</td>
                <td className="whitespace-nowrap py-2 pr-2 text-right font-bold tabular-nums">{fmtINR(totalDue)}</td>
                <td className="whitespace-nowrap py-2 pr-2 text-right font-bold tabular-nums">{fmtINR(totalPaid)}</td>
                <td className={`whitespace-nowrap py-2 pr-2 text-right font-bold tabular-nums ${totalOutstanding > 0 ? "" : "text-slate-500"}`}>
                  {fmtINR(totalOutstanding)}
                </td>
                <td colSpan={2} className="py-2 text-right text-xs text-slate-600">
                  Collected {rate}% of expected
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 text-xs text-slate-600">
            Collected {fmtINR(totalPaid)} of {fmtINR(totalDue)} expected — {rate}% of expected.{" "}
            {totalOutstanding > 0 ? `${fmtINR(totalOutstanding)} remains outstanding as of ${fmtDate(todayIsoDate())}.` : "All invoices settled."}
          </p>

          <div className="mt-12 flex items-end justify-between gap-8">
            <div>
              <div className="w-44 border-b border-slate-400" />
              <p className="mt-1 text-xs text-slate-500">Manager signature</p>
            </div>
            <div className="text-right">
              <div className="ml-auto w-44 border-b border-slate-400" />
              <p className="mt-1 text-xs text-slate-500">Date</p>
            </div>
          </div>

          <p className="mt-8 text-[11px] text-slate-400">
            This is a computer-generated statement and does not require a physical signature.
          </p>
        </div>
      </div>
    </div>
  );
}
