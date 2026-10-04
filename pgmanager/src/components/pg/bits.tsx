"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtINR, monthLabel } from "@/lib/client";

// ---------- status badge ----------
const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  PARTIAL: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
  DUE: "border-amber-300/60 bg-amber-100 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/20 dark:text-amber-300",
  OVERDUE: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/25",
  WAIVED: "bg-slate-500/10 text-slate-500 dark:text-slate-500 border-slate-400/25",
  VACANT: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25",
  OCCUPIED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  NOTICE: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
  ACTIVE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  CHECKED_OUT: "bg-slate-500/10 text-slate-500 dark:text-slate-500 border-slate-400/25",
  OPEN: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
  IN_PROGRESS: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  RESOLVED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  HIGH: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/25",
  MEDIUM: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
  LOW: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25",
};

const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "In progress",
  CHECKED_OUT: "Checked out",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status?.toUpperCase() ?? "";
  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[key] ?? STATUS_STYLES.DUE, className)}>
      {STATUS_LABELS[key] ?? (key === "" ? "—" : key.charAt(0) + key.slice(1).toLowerCase())}
    </Badge>
  );
}

// ---------- money ----------
export function Money({
  value,
  compact = false,
  muted = false,
  signed = false,
  className,
}: {
  value: number | null | undefined;
  compact?: boolean;
  muted?: boolean;
  signed?: boolean;
  className?: string;
}) {
  const v = Number(value ?? 0);
  const sign = signed && v > 0 ? "+" : signed && v < 0 ? "−" : "";
  const display = signed ? fmtINR(Math.abs(v), compact) : fmtINR(value, compact);
  return (
    <span
      className={cn(
        "tabular-nums font-medium",
        muted && "text-muted-foreground font-normal",
        className
      )}
    >
      {sign}
      {display}
    </span>
  );
}

// ---------- section label ----------
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-wider text-muted-foreground", className)}>
      {children}
    </p>
  );
}

// ---------- page header ----------
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------- empty / error states ----------
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-rose-500/10">
        <RotateCcw className="size-6 text-rose-600 dark:text-rose-400" />
      </div>
      <p className="text-sm font-medium text-rose-700 dark:text-rose-400">Couldn&apos;t load this data</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="size-4" /> Retry
        </Button>
      )}
    </div>
  );
}

export function LoadingGrid({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="rounded-xl">
          <CardContent className="p-5 md:p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-32" />
            <Skeleton className="mt-3 h-2 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------- count-up ----------
// useLayoutEffect on the client (jump to the animation start BEFORE first paint,
// so the final value never flashes); plain useEffect while SSR'd (no-op there).
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * rAF-based count-up from ~85% of target (not 0 — avoids a jarring start).
 * Ease-out cubic, integer steps, ~700ms. Skips animation entirely when the user
 * prefers reduced motion. When `target` changes the count re-runs from 85% of it.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  useIsoLayoutEffect(() => {
    if (!Number.isFinite(target) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const start = Math.round(target * 0.85);
    if (start === target) {
      setValue(target);
      return;
    }
    setValue(start);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number): void => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - p) ** 3; // ease-out cubic
      setValue(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

// ---------- KPI card ----------
export function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
  progress,
  progressLabel,
  progressValue,
  countUp,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "emerald" | "amber" | "rose" | "neutral";
  /** 0–100. When set, renders the standard label row + full-width h-2 bar. */
  progress?: number;
  /** Left text of the bar's label row (defaults to the card label). */
  progressLabel?: string;
  /** Right text of the bar's label row (defaults to `${progress}%`). */
  progressValue?: string;
  /**
   * Animate the big value: counts up from ~85% of `target` (rAF, respects
   * prefers-reduced-motion). The raw animated integer is passed to `format`
   * on every frame (defaults to fmtINR); `value` remains the fallback when omitted.
   */
  countUp?: { target: number; format?: (n: number) => React.ReactNode };
  className?: string;
}) {
  const tones = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    neutral: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  } as const;
  const bars = {
    // dark variants brightened one step so bars pop against the muted track
    emerald: "bg-emerald-500 dark:bg-emerald-400",
    amber: "bg-amber-500 dark:bg-amber-400",
    rose: "bg-rose-500 dark:bg-rose-400",
    neutral: "bg-slate-400 dark:bg-slate-300",
  } as const;
  const pct = progress !== undefined ? Math.min(100, Math.max(0, progress)) : null;
  const animated = useCountUp(countUp?.target ?? 0);
  const display = countUp
    ? countUp.format
      ? countUp.format(animated)
      : fmtINR(animated)
    : value;
  return (
    <Card
      className={cn(
        "rounded-xl border-border/60 shadow-sm transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md",
        className
      )}
    >
      <CardContent className="p-5 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>{label}</SectionLabel>
          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
            <Icon className="size-4" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums md:text-[1.75rem]">{display}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        {pct !== null && (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{progressLabel ?? label}</span>
              <span className="shrink-0 font-medium tabular-nums">{progressValue ?? `${Math.round(pct)}%`}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", bars[tone])}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- month navigator ----------
export function MonthNav({
  month,
  onChange,
  allowFuture = false,
  showReset = false,
  className,
}: {
  month: string;
  onChange: (m: string) => void;
  allowFuture?: boolean;
  showReset?: boolean;
  className?: string;
}) {
  const now = month;
  const prevMonth = shiftMonth(now, -1);
  const nextMonth = shiftMonth(now, 1);
  const current = new Date();
  const currentYm = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  const atCurrent = now >= currentYm;
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button variant="outline" size="icon" className="size-9" aria-label="Previous month" onClick={() => onChange(prevMonth)}>
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-28 text-center text-sm font-semibold tabular-nums">{monthLabel(now, true)}</span>
      <Button
        variant="outline"
        size="icon"
        className="size-9"
        aria-label="Next month"
        disabled={allowFuture ? false : atCurrent}
        onClick={() => onChange(nextMonth)}
      >
        <ChevronRight className="size-4" />
      </Button>
      {showReset && now !== currentYm && (
        <Button variant="ghost" size="sm" className="ml-1 h-9" onClick={() => onChange(currentYm)}>
          This month
        </Button>
      )}
    </div>
  );
}

export function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------- busy button helper ----------
export function SpinnerButton({
  busy,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { busy?: boolean }) {
  return (
    <Button className={className} disabled={busy || props.disabled} {...props}>
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}
