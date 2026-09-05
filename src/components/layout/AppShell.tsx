"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
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
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside <AppShell>");
  return value;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { account, user, signOut } = useSession();
  const { stats, refresh } = useStats();

  return (
    <AppContext.Provider
      value={{
        stats,
        refreshStats: refresh,
        accountEmail: account?.email ?? null,
        userName: user?.name ?? null,
      }}
    >
      <div className={styles.shell}>
        <Sidebar inboxHealth={stats?.inboxHealth ?? null} />

        <div className={styles.body}>
          <TopBar
            name={user?.name ?? null}
            email={account?.email ?? user?.email ?? null}
            onSignOut={signOut}
          />
          <main className={styles.main}>{children}</main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
