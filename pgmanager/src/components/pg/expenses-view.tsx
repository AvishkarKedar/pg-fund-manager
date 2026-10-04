"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, MoreHorizontal, Pencil, Plus, Trash2, TrendingDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { api, useApi, useSignalReload } from "@/hooks/pg/useApi";
import type { ExpenseRow, ExpensesResponse } from "@/lib/client";
import { fmtDate, fmtINR, monthLabel, todayIsoDate, todayYm } from "@/lib/client";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, KpiCard, Money, PageHeader, SectionLabel } from "@/components/pg/bits";

const CATEGORY_DOTS: Record<string, string> = {
  FOOD: "bg-amber-500",
  ELECTRICITY: "bg-yellow-500",
  WATER: "bg-teal-500",
  MAINTENANCE: "bg-stone-500",
  SALARY: "bg-slate-400",
  INTERNET: "bg-emerald-500",
  CLEANING: "bg-lime-600",
  REPAIR: "bg-orange-600",
  RENT: "bg-rose-400",
  OTHER: "bg-neutral-400",
};

export function ExpensesView({ refreshSignal }: { refreshSignal: number }) {
  const [month, setMonth] = useState(todayYm());
  const [category, setCategory] = useState("ALL");
  const params = new URLSearchParams({ month });
  if (category !== "ALL") params.set("category", category);
  const { data, error, loading, reload } = useApi<ExpensesResponse>(`/api/expenses?${params.toString()}`);
  useSignalReload(refreshSignal, reload);

  const [formOpen, setFormOpen] = useState(false);
  const [editRow, setEditRow] = useState<ExpenseRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<ExpenseRow | null>(null);

  const topCategory = data?.summary.byCategory[0];

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle={data ? `${monthLabel(month, true)} · ${data.summary.count} entries` : "Property costs"}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => (window.location.href = `/api/reports/export?type=expenses&month=${month}`)}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditRow(null); setFormOpen(true); }}>
              <Plus className="size-4" /> Add expense
            </Button>
          </>
        }
      />

      {/* filters */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="month"
          className="h-10 sm:w-44"
          value={month}
          onChange={(e) => setMonth(e.target.value || todayYm())}
          aria-label="Expense month"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-10 w-full sm:w-48" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {(data?.categories ?? []).map((c) => (
              <SelectItem key={c} value={c}>
                <span className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", CATEGORY_DOTS[c] ?? "bg-neutral-400")} />
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <div className="space-y-6">
          {/* summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              icon={Wallet}
              label="Total this month"
              value={fmtINR(data.summary.total)}
              sub={data.summary.count === 0 ? "Nothing logged yet" : `${data.summary.count} expense${data.summary.count === 1 ? "" : "s"} logged`}
              tone="rose"
            />
            <KpiCard
              icon={TrendingDown}
              label="Top category"
              value={topCategory ? topCategory.category.charAt(0) + topCategory.category.slice(1).toLowerCase() : "—"}
              sub={topCategory ? fmtINR(topCategory.amount) : "No expenses"}
              tone="amber"
            />
            <Card className="rounded-xl border-border/60 shadow-sm">
              <CardContent className="p-5">
                <SectionLabel>6-month trend</SectionLabel>
                <div className="mt-2 h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.trend} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                      <Tooltip
                        cursor={{ fill: "var(--muted)" }}
                        formatter={(v: number | string) => [fmtINR(Number(v)), "Expenses"]}
                        contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }}
                      />
                      <Bar dataKey="amount" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* list */}
          <Card className="rounded-xl border-border/60 shadow-sm">
            {data.expenses.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title={`No expenses for ${monthLabel(month)}`}
                hint="Log food, electricity, salary and other costs to see true net income."
                action={
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setFormOpen(true)}>
                    <Plus className="size-4" /> Add expense
                  </Button>
                }
              />
            ) : (
              <>
                {/* desktop */}
                <div className="hidden thin-scroll overflow-x-auto md:block">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.expenses.map((e) => (
                        <TableRow key={e.id} className="odd:bg-muted/30 hover:odd:bg-muted/50">
                          <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(e.date)}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-2 font-medium">
                              <span className={cn("size-2.5 rounded-full", CATEGORY_DOTS[e.category] ?? "bg-neutral-400")} />
                              {e.category.charAt(0) + e.category.slice(1).toLowerCase()}
                            </span>
                          </TableCell>
                          <TableCell>{e.vendor ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="max-w-56 truncate text-muted-foreground">{e.notes ?? "—"}</TableCell>
                          <TableCell className="text-right"><Money value={e.amount} className="text-rose-600 dark:text-rose-400" /></TableCell>
                          <TableCell>
                            <ExpenseActions
                              row={e}
                              onEdit={() => { setEditRow(e); setFormOpen(true); }}
                              onDelete={() => setDeleteRow(e)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* mobile */}
                <div className="divide-y divide-border/60 md:hidden">
                  {data.expenses.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={cn("size-2.5 shrink-0 rounded-full", CATEGORY_DOTS[e.category] ?? "bg-neutral-400")} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {e.category.charAt(0) + e.category.slice(1).toLowerCase()}
                          {e.vendor ? <span className="text-muted-foreground"> · {e.vendor}</span> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {fmtDate(e.date)}
                          {e.notes ? ` · ${e.notes}` : ""}
                        </p>
                      </div>
                      <Money value={e.amount} className="text-sm text-rose-600 dark:text-rose-400" />
                      <ExpenseActions
                        row={e}
                        onEdit={() => { setEditRow(e); setFormOpen(true); }}
                        onDelete={() => setDeleteRow(e)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      ) : null}

      <ExpenseFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditRow(null); }}
        row={editRow}
        categories={data?.categories ?? []}
        defaultDate={month === todayYm() ? todayIsoDate() : `${month}-01`}
        onSaved={reload}
      />

      <AlertDialog open={!!deleteRow} onOpenChange={(v) => !v && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRow && <>{fmtINR(deleteRow.amount)} · {deleteRow.category.toLowerCase()}{deleteRow.vendor ? ` · ${deleteRow.vendor}` : ""}. This cannot be undone.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={async () => {
                if (!deleteRow) return;
                try {
                  await api(`/api/expenses/${deleteRow.id}`, { method: "DELETE" });
                  toast.success("Expense deleted");
                  reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Delete failed");
                } finally {
                  setDeleteRow(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ExpenseActions({ row, onEdit, onDelete }: { row: ExpenseRow; onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Expense actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}><Pencil className="size-4" /> Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-rose-600 focus:text-rose-600 dark:text-rose-400">
          <Trash2 className="size-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExpenseFormDialog({
  open,
  onClose,
  row,
  categories,
  defaultDate,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  row: ExpenseRow | null;
  categories: string[];
  defaultDate: string;
  onSaved: () => void;
}) {
  const editing = !!row;
  const [form, setForm] = useState({ date: todayIsoDate(), category: "FOOD", amount: "", vendor: "", notes: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      date: row ? row.date.slice(0, 10) : defaultDate,
      category: row?.category ?? "FOOD",
      amount: row ? String(row.amount) : "",
      vendor: row?.vendor ?? "",
      notes: row?.notes ?? "",
    });
  }, [open, row, defaultDate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const amt = Number(form.amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      const body = {
        date: form.date,
        category: form.category,
        amount: amt,
        vendor: form.vendor.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editing) {
        await api(`/api/expenses/${row!.id}`, { method: "PATCH", body });
        toast.success("Expense updated");
      } else {
        await api("/api/expenses", { body });
        toast.success(`${fmtINR(amt)} expense logged`);
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save expense");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit expense" : "Add expense"}</DialogTitle>
          <DialogDescription>Property running costs — food, electricity, salary and more</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input type="number" min="1" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="2500" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(categories.length ? categories : ["FOOD", "ELECTRICITY", "WATER", "MAINTENANCE", "SALARY", "INTERNET", "CLEANING", "REPAIR", "RENT", "OTHER"]).map((c) => (
                  <SelectItem key={c} value={c}>
                    <span className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", CATEGORY_DOTS[c] ?? "bg-neutral-400")} />
                      {c.charAt(0) + c.slice(1).toLowerCase()}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vendor</Label>
            <Input value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} placeholder="e.g. Sharma Kirana" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="optional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy ? "Saving…" : editing ? "Save changes" : "Add expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
