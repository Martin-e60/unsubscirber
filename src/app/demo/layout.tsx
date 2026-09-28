"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DEMO_NAV } from "@/lib/navigation";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { ApiProvider } from "@/lib/api/context";
import { demoClient } from "@/lib/demo/client";

/**
 * The public demo.
 *
 * One provider swap is the entire trick: everything below this point is the
 * real signed-in application — the same shell, list, toolbar, rows, scan panel,
 * stats and history — talking to an implementation that answers from this
 * visitor's own browser instead of the server. So there is no second copy of
 * the interface to keep in step, no account, no mailbox, and no request that
 * could reach Gmail or the database.
 *
 * Note what this deliberately is *not*: it does not touch /api/auth/dev, whose
 * production guard stays exactly as it was.
 */
export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <ApiProvider client={demoClient}>
      <AppShell
        basePath="/demo"
        navItems={DEMO_NAV}
        signOutLabel="Leave demo"
        banner={<DemoBanner />}
        demo
      >
        {children}
      </AppShell>
    </ApiProvider>
  );
}
