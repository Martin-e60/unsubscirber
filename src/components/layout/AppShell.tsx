"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import type { NavItem } from "@/lib/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { useSession } from "@/hooks/useSession";
import { useStats } from "@/hooks/useStats";
import type { StatsDto } from "@/lib/api/types";
import styles from "./AppShell.module.css";

/**
 * The signed-in layout: sidebar, top bar, page content.
 *
 * It also owns the two pieces of data every page needs — the session and the
 * stats — and shares them through a context, so navigating between pages does
 * not refetch them and the sidebar's health meter stays in step with whatever
 * the current page just changed.
 */

type AppContextValue = {
  stats: StatsDto | null;
  refreshStats: () => Promise<void>;
  accountEmail: string | null;
  userName: string | null;
  /** "" for the real app, "/demo" when the demo mounts these screens. */
  basePath: string;
  /** True inside the public demo, so copy can be honest about it. */
  demo: boolean;
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside <AppShell>");
  return value;
}

export function AppShell({
  children,
  basePath = "",
  navItems,
  signOutLabel,
  banner,
  demo = false,
}: {
  children: ReactNode;
  basePath?: string;
  navItems?: NavItem[];
  signOutLabel?: string;
  /** Rendered above the top bar — the demo's "sample data" strip. */
  banner?: ReactNode;
  demo?: boolean;
}) {
  const { account, user, signOut } = useSession();
  const { stats, refresh } = useStats();

  return (
    <AppContext.Provider
      value={{
        stats,
        refreshStats: refresh,
        accountEmail: account?.email ?? null,
        userName: user?.name ?? null,
        basePath,
        demo,
      }}
    >
      <div className={styles.shell}>
        <Sidebar
          inboxHealth={stats?.inboxHealth ?? null}
          basePath={basePath}
          items={navItems}
        />

        <div className={styles.body}>
          {banner}
          <TopBar
            name={user?.name ?? null}
            email={account?.email ?? user?.email ?? null}
            onSignOut={signOut}
            basePath={basePath}
            signOutLabel={signOutLabel}
          />
          <main className={styles.main}>{children}</main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
