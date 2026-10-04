"use client";

import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtINR, type PropertySettings } from "@/lib/client";

export interface ReceiptData {
  receiptNumber: string;
  amount: number;
  date: string;
  method: string;
  reference: string | null;
  tenantName: string;
  roomBed?: string | null;
  period?: string | null;
  notes?: string | null;
}

/** Professional printable receipt. Print CSS hides everything but #print-root. */
export function ReceiptPrintDialog({
  open,
  onClose,
  receipt,
  property,
}: {
  open: boolean;
  onClose: () => void;
  receipt: ReceiptData | null;
  property?: PropertySettings | null;
}) {
  if (!open || !receipt) return null;
  const p = property ?? {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:bg-transparent print:p-0">
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto thin-scroll rounded-xl bg-background shadow-xl print:overflow-visible print:rounded-none print:shadow-none">
        {/* screen-only toolbar */}
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3 print:hidden">
          <p className="text-sm font-semibold">Receipt {receipt.receiptNumber}</p>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={onClose}>
              <X className="size-4" /> Close
            </Button>
          </div>
        </div>

        {/* the receipt itself — the only thing visible when printing */}
        <div id="print-root" className="mx-auto bg-white p-8 text-slate-900 print:p-2">
          <div className="border-b-2 border-emerald-600 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{p.name || "PG"}</h2>
                {p.address && <p className="mt-0.5 max-w-xs text-xs text-slate-600">{p.address}</p>}
                {p.phone && <p className="text-xs text-slate-600">Phone: {p.phone}</p>}
              </div>
              <div className="text-right">
                <p className="text-sm font-bold uppercase tracking-widest text-emerald-700">Payment Receipt</p>
                <p className="mt-1 font-mono text-sm">{receipt.receiptNumber}</p>
                <p className="text-xs text-slate-600">{fmtDate(receipt.date)}</p>
              </div>
            </div>
          </div>

          <table className="mt-5 w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="w-40 py-2 text-slate-500">Received from</td>
                <td className="py-2 font-medium">{receipt.tenantName}</td>
              </tr>
              {receipt.roomBed && (
                <tr className="border-b border-slate-200">
                  <td className="py-2 text-slate-500">Accommodation</td>
                  <td className="py-2 font-medium">Room {receipt.roomBed}</td>
                </tr>
              )}
              {receipt.period && (
                <tr className="border-b border-slate-200">
                  <td className="py-2 text-slate-500">Towards</td>
                  <td className="py-2 font-medium">Rent for {receipt.period}</td>
                </tr>
              )}
              <tr className="border-b border-slate-200">
                <td className="py-2 text-slate-500">Amount</td>
                <td className="py-2 text-base font-bold tabular-nums">{fmtINR(receipt.amount)}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="py-2 text-slate-500">Payment mode</td>
                <td className="py-2 font-medium">{receipt.method}</td>
              </tr>
              {receipt.reference && (
                <tr className="border-b border-slate-200">
                  <td className="py-2 text-slate-500">Reference</td>
                  <td className="py-2 font-mono text-xs">{receipt.reference}</td>
                </tr>
              )}
            </tbody>
          </table>

          {receipt.notes && <p className="mt-3 text-xs text-slate-600">Note: {receipt.notes}</p>}

          <div className="mt-10 flex items-end justify-between gap-6">
            <div>
              {p.upiId && (
                <p className="text-xs text-slate-500">
                  UPI ID: <span className="font-medium text-slate-800">{p.upiId}</span>
                </p>
              )}
              <p className="mt-1 text-[11px] text-slate-400">
                This is a computer-generated receipt and does not require a physical signature.
              </p>
            </div>
            <div className="text-right">
              <div className="ml-auto w-44 border-b border-slate-400" />
              <p className="mt-1 text-xs text-slate-500">
                {p.ownerName || "Owner"} · Authorised signatory
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
