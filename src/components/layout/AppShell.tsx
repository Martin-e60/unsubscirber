"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { Mails } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { useSession } from "@/hooks/useSession";
import { useStats } from "@/hooks/useStats";
import type { StatsDto } from "@/lib/api/types";
import type { NavItem } from "@/lib/navigation";
import theme from "./appTheme.module.css";
import styles from "./AppShell.module.css";

/**
 * The signed-in layout: sidebar and page content, in the app's warm theme.
 *
 * It also owns the data every page needs — the session and the stats — and
 * shares them through a context, so moving between pages does not refetch
 * them and the Cleanup count in the sidebar stays in step with whatever the
 * current page just changed.
 */

type AppContextValue = {
  stats: StatsDto | null;
  refreshStats: () => Promise<void>;
  accountEmail: string | null;
  userName: string | null;
  /** Null while the session is loading; then whether Gmail is connected. */
  accountConnected: boolean | null;
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
  /** Rendered above the page — the demo's "sample data" strip. */
  banner?: ReactNode;
  demo?: boolean;
}) {
  const { account, user, signOut, loading } = useSession();
  const { stats, refresh } = useStats();

  const accountDetails = {
    name: user?.name ?? null,
    email: account?.email ?? user?.email ?? null,
    onSignOut: () => void signOut(),
    signOutLabel,
  };

  return (
    <AppContext.Provider
      value={{
        stats,
        refreshStats: refresh,
        accountEmail: account?.email ?? null,
        userName: user?.name ?? null,
        accountConnected: loading ? null : Boolean(account),
        basePath,
        demo,
      }}
    >
      <div className={`${theme.theme} ${styles.shell}`}>
        <Sidebar
          basePath={basePath}
          items={navItems}
          cleanupCount={stats?.activeSenders ?? null}
          account={accountDetails}
        />

        <div className={styles.body}>
          {/* Phones only: the sidebar is a bottom tab bar there, so the brand
              and the account need somewhere to live. */}
          <header className={styles.mobileBar}>
            <Link href={basePath || "/dashboard"} className={styles.mobileBrand} aria-label="Tidely home">
              <span className={styles.mobileMark} aria-hidden="true">
                <Mails size={18} strokeWidth={1.9} />
              </span>
              <span className={styles.mobileWord}>tidely.</span>
            </Link>
            <AccountMenu {...accountDetails} placement="down" compact />
          </header>

          {banner}
          <main className={styles.main}>{children}</main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
