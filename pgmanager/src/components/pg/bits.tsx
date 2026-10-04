"use client";

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
  DUE: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25",
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
          <CardContent className="p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-32" />
            <Skeleton className="mt-3 h-1.5 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------- KPI card ----------
export function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
  progress,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "emerald" | "amber" | "rose" | "neutral";
  progress?: number;
  className?: string;
}) {
  const tones = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    neutral: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  } as const;
  const bars = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    neutral: "bg-slate-400",
  } as const;
  return (
    <Card className={cn("rounded-xl border-border/60 shadow-sm transition-shadow hover:shadow-md", className)}>
      <CardContent className="p-5 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>{label}</SectionLabel>
          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
            <Icon className="size-4" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums md:text-[1.75rem]">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        {progress !== undefined && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", bars[tone])}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
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
