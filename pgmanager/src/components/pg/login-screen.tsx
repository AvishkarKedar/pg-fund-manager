"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  BedDouble, FileSpreadsheet, Loader2, Lock, LogIn, Mail, MessageCircle, ReceiptIndianRupee, ShieldCheck, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/hooks/pg/useApi";
import { monthLabel, todayYm } from "@/lib/client";

const FEATURES = [
  { icon: MessageCircle, label: "Rent roll & WhatsApp reminders" },
  { icon: FileSpreadsheet, label: "Excel import wizard" },
  { icon: ReceiptIndianRupee, label: "Receipts, statements & reports" },
  { icon: Sparkles, label: "AI insights & data doctor" },
] as const;

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { email, password } });
      onLoggedIn();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed";
      setError(message);
      toast.error(message, { description: "Check the email and password, then try again." });
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 flex-col md:flex-row">
        {/* ---------- left brand panel (md+) ---------- */}
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-700 md:block md:w-[44%] lg:w-[42%]">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -right-24 -top-24 size-80 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-teal-300/10 blur-3xl" />
            <div className="absolute right-1/4 top-1/3 size-40 rounded-full bg-emerald-300/10 blur-2xl" />
          </div>
          <div className="relative flex h-full flex-col justify-between p-10 lg:p-14">
            <div className="flex size-12 items-center justify-center rounded-xl bg-white/10 text-white shadow-lg">
              <BedDouble className="size-6" />
            </div>
            <div className="space-y-8">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white lg:text-3xl">PG Fund Manager</h1>
                <p className="mt-2 text-sm text-emerald-100/90 lg:text-base">Run your PG like a pro</p>
              </div>
              <ul className="space-y-3.5">
                {FEATURES.map((f) => (
                  <li key={f.label} className="flex items-center gap-3 text-sm text-emerald-50/90">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                      <f.icon className="size-4" />
                    </span>
                    {f.label}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-emerald-50/85">Built for Indian property owners</p>
          </div>
        </aside>

        {/* ---------- mobile brand bar ---------- */}
        <div className="flex items-center gap-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3 md:hidden">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
            <BedDouble className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">PG Fund Manager</p>
            <p className="truncate text-[11px] text-emerald-100/80">Run your PG like a pro</p>
          </div>
        </div>

        {/* ---------- right form panel ---------- */}
        <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-emerald-50/60 via-background to-background px-4 py-10 dark:from-emerald-950/20">
          <motion.div
            className="w-full max-w-sm"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <Card className="rounded-xl border-border/60 shadow-sm">
              <CardContent className="p-6 md:p-8">
                <div className="mb-6 space-y-1">
                  <h2 className="text-xl font-semibold tracking-tight">Welcome back</h2>
                  <p className="text-sm text-muted-foreground">Sign in to your PG workspace</p>
                </div>
                <form onSubmit={submit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.in"
                        className="pl-9"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className="pl-9"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-400" role="alert">
                      {error}
                    </p>
                  )}

                  <Button type="submit" className="h-10 w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                    {busy ? "Signing in…" : "Sign in"}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setEmail("owner@pgdemo.in");
                      setPassword("owner123");
                    }}
                    className="mx-auto flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
                  >
                    <Sparkles className="size-3.5 shrink-0" />
                    Demo: owner@pgdemo.in / owner123 — click to autofill
                  </button>
                </form>

                <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5 shrink-0" />
                  Sessions use encrypted httpOnly cookies
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </section>
      </div>

      {/* ---------- sticky footer (matches the app shell) ---------- */}
      <footer className="mt-auto border-t border-border/60 px-4 py-3 text-center text-xs text-muted-foreground">
        PG Fund Manager · Built for Indian property owners · {monthLabel(todayYm(), true)}
      </footer>
    </main>
  );
}
