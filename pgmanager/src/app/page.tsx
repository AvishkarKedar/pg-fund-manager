"use client";

import { Loader2 } from "lucide-react";
import { useApi } from "@/hooks/pg/useApi";
import type { MeResponse } from "@/lib/client";
import { LoginScreen } from "@/components/pg/login-screen";
import { AppShell } from "@/components/pg/app-shell";
import { ErrorState } from "@/components/pg/bits";

export default function Page() {
  const me = useApi<MeResponse>("/api/auth/me");

  if (me.loading && !me.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-lg font-bold text-white shadow-lg shadow-emerald-500/25">
          PG
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading PG Fund Manager…
        </div>
      </div>
    );
  }

  if (me.error) {
    return (
      <div className="min-h-screen bg-background">
        <ErrorState message={me.error} onRetry={me.reload} />
      </div>
    );
  }

  if (!me.data?.user) {
    return <LoginScreen onLoggedIn={me.reload} />;
  }

  return <AppShell me={me.data} reloadMe={me.reload} />;
}
