"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, ExternalLink, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/pg/useApi";
import type { SettingsResponse } from "@/lib/client";
import { fmtINR } from "@/lib/client";

/** Who we're collecting from — shown as a scannable UPI request. */
export interface UpiCollectTarget {
  name: string;
  amount: number;
  note: string;
}

/** Rupee amount for the deep link — max 2 decimals, no thousands separators. */
function amountParam(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

export function UpiCollectDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: UpiCollectTarget | null;
}) {
  // settings self-fetch on every open (same pattern as dashboard/rent views) — gives us upiId + property name
  const { data: settingsData, error: settingsError, loading: settingsLoading } = useApi<SettingsResponse>(
    open ? "/api/settings" : null
  );
  const property = settingsData?.settings?.property ?? null;
  const upiId = property?.upiId?.trim() || null;
  const propertyName = property?.name?.trim() || null;

  useEffect(() => {
    if (settingsError) toast.error(settingsError);
  }, [settingsError]);

  // cover the first frame after open flips (fetch not started yet) so the empty state never flashes
  const loading = settingsLoading || (open && !settingsData && !settingsError);

  const link =
    upiId && target
      ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(propertyName ?? "PG")}&am=${amountParam(target.amount)}&cu=INR&tn=${encodeURIComponent(target.note)}`
      : null;

  // render the QR as a PNG data URL whenever the deep link changes — state is
  // keyed by the link it belongs to, so a stale QR from the previous tenant is
  // simply ignored (and the same-size skeleton shows) until the new one lands
  const [qrState, setQrState] = useState<{ link: string; url: string } | null>(null);
  const [qrFailedLink, setQrFailedLink] = useState<string | null>(null);
  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    QRCode.toDataURL(link, { margin: 1, width: 232, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((dataUrl) => {
        if (!cancelled) setQrState({ link, url: dataUrl });
      })
      .catch(() => {
        if (cancelled) return;
        setQrFailedLink(link);
        toast.error("Could not generate the QR code");
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  const qr = link && qrState?.link === link ? qrState.url : null;
  const qrError = link !== null && qrFailedLink === link;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("UPI link copied", { description: `${target ? `${target.name} · ${fmtINR(target.amount)} request` : "Ready to paste in any chat."}` });
    } catch {
      toast.error("Could not copy the link");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-5 text-emerald-600 dark:text-emerald-400" />
            Collect via UPI
          </DialogTitle>
          <DialogDescription className="sr-only">UPI collect request with a QR code and payment deep link</DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{target.name}</p>
            <p className="text-2xl font-bold tabular-nums">{fmtINR(target.amount)}</p>
            <p className="truncate text-sm text-muted-foreground">{target.note}</p>
          </div>
        )}

        {settingsError ? (
          <p className="py-10 text-center text-sm text-rose-600 dark:text-rose-400">
            Could not load payment settings. Close and try again.
          </p>
        ) : loading ? (
          // skeleton of the exact QR size — no layout shift once it renders
          <div className="flex flex-col items-center gap-2">
            <div className="flex size-[256px] items-center justify-center rounded-xl border bg-white p-3">
              <Skeleton className="size-[232px] rounded-lg bg-muted" />
            </div>
            <p className="text-xs text-muted-foreground">Scan with any UPI app</p>
          </div>
        ) : !upiId ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <QrCode className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No UPI ID configured</p>
            <p className="max-w-xs text-sm text-muted-foreground">Add it in Settings → Property → UPI ID to collect rent by QR code.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {/* white panel so the QR stays scannable in dark mode too */}
            <div className="flex size-[256px] items-center justify-center rounded-xl border bg-white p-3 shadow-sm">
              {qrError ? (
                <p className="px-6 text-center text-sm text-rose-600 dark:text-rose-400">QR failed — use the copy link below.</p>
              ) : qr ? (
                <img src={qr} alt="UPI payment QR code" width={232} height={232} className="size-[232px]" />
              ) : (
                <Skeleton className="size-[232px] rounded-lg bg-muted" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">Scan with any UPI app</p>
            <p className="font-mono text-xs text-muted-foreground">{upiId}</p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={!link} onClick={copyLink}>
            <Copy className="size-4" /> Copy UPI link
          </Button>
          {link ? (
            <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
              <a href={link} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> Open UPI app
              </a>
            </Button>
          ) : (
            <Button disabled className="bg-emerald-600 hover:bg-emerald-700">
              <ExternalLink className="size-4" /> Open UPI app
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
