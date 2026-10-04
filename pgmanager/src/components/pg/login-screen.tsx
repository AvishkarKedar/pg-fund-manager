"use client";

import { useState } from "react";
import { Building2, Loader2, Lock, LogIn, Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/hooks/pg/useApi";

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { email, password } });
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50/60 via-background to-background px-4 py-10 dark:from-emerald-950/20">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-xl font-bold text-white shadow-lg shadow-emerald-500/25">
            PG
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">PG Fund Manager</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Property finance &amp; management for paying-guest homes
            </p>
          </div>
        </div>

        <Card className="rounded-xl border-border/60 shadow-sm">
          <CardContent className="p-6">
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
                <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
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
                <Sparkles className="size-3.5" />
                Demo: owner@pgdemo.in / owner123 — click to autofill
              </button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Building2 className="size-3.5" />
          Rent · payments · expenses · tenants · Excel import
        </p>
      </div>
    </main>
  );
}
