"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Mails, X } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { MailboxSwitcher } from "@/components/layout/MailboxSwitcher";
import {
  MailboxContext,
  MailboxOperationContext,
  readTabMailbox,
  writeTabMailbox,
  type MailboxContextValue,
} from "@/components/layout/MailboxContext";
import { useSession } from "@/hooks/useSession";
import { useStats } from "@/hooks/useStats";
import { ApiProvider, useApi } from "@/lib/api/context";
import { createMailboxClient } from "@/lib/api/scoped";
import type { MailboxDto, MailboxesResponse, StatsDto } from "@/lib/api/types";
import {
  MAILBOX_ERROR_PARAM,
  MAILBOX_PARAM,
  MAILBOX_SPECIFIC_PARAMS,
  MAILBOX_STATUS_PARAM,
  mailboxErrorMessage,
  mailboxStatusMessage,
  mailboxTitle,
  pickActiveMailbox,
} from "@/lib/mailbox/shared";
import type { NavItem } from "@/lib/navigation";
import theme from "./appTheme.module.css";
import styles from "./AppShell.module.css";

/**
 * The signed-in layout: sidebar and page content, in the app's warm theme.
 *
 * It owns the session and which mailbox this tab is using, and shares the
 * per-mailbox data every page needs — the stats — through a context, so
 * moving between pages does not refetch them and the Cleanup count in the
 * sidebar stays in step with whatever the current page just changed.
 *
 * Switching mailbox
 * -----------------
 * Everything that belongs to one mailbox — the page, its lists, selections,
 * open dialogs, the stats, the sidebar count — sits below one boundary that
 * is keyed by the mailbox. Switching remounts it from scratch, so nothing
 * from the previous mailbox can survive: no stale rows, no selection, no
 * half-open confirmation. Below the boundary, every request goes through a
 * client bound to that mailbox (see src/lib/api/scoped.ts); on a switch it is
 * cancelled, so a late answer for the old mailbox is dropped and a loop that
 * was still running cannot send its next step. The URL stays where it was,
 * minus anything that pointed inside the old mailbox.
 *
 * Each tab keeps its own choice (sessionStorage), and the server remembers
 * the last one picked for the next fresh visit. Requests always name their
 * mailbox, so two tabs on two mailboxes never interfere.
 */

type AppContextValue = {
  stats: StatsDto | null;
  refreshStats: () => Promise<void>;
  /** The address of the mailbox this tab is using. */
  accountEmail: string | null;
  /** That mailbox, with its name and state. */
  mailbox: MailboxDto | null;
  userName: string | null;
  /** Null while the session is loading; then whether a mailbox is selected. */
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

type Scope = {
  mailboxId: string | null;
  /** Aborted when this tab leaves the mailbox. */
  controller: AbortController;
  /** Bumped on every switch, so even a return to the same mailbox starts fresh. */
  generation: number;
};

type Notice = { tone: "success" | "warning"; text: string };

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
  const base = useApi();
  const { session, user, mailboxes, signOut, loading, refresh, setMailboxes } = useSession();
  // Moving between pages reuses the session this tab already loaded (see
  // useSession), so the page can open on the same mailbox straight away.
  const [scope, setScope] = useState<Scope | null>(() => {
    if (!session || typeof window === "undefined") return null;
    return {
      mailboxId: pickActiveMailbox(
        session.mailboxes.map((mailbox) => mailbox.id),
        { fromTab: readTabMailbox(demo), remembered: session.activeMailboxId },
      ),
      controller: new AbortController(),
      generation: 1,
    };
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const scopeRef = useRef<Scope | null>(scope);
  scopeRef.current = scope;

  // Long-running work in the current mailbox, counted per scope.
  const busy = useRef({ generation: scope?.generation ?? -1, count: 0 });

  const enter = useCallback(
    (mailboxId: string | null) => {
      const previous = scopeRef.current;
      previous?.controller.abort();
      const next: Scope = {
        mailboxId,
        controller: new AbortController(),
        generation: (previous?.generation ?? 0) + 1,
      };
      busy.current = { generation: next.generation, count: 0 };
      scopeRef.current = next;
      setScope(next);
      writeTabMailbox(demo, mailboxId);
    },
    [demo],
  );

  // First load: pick this tab's mailbox, and show the outcome of an add or
  // reconnect that just returned from Google.
  const initialised = useRef(scope !== null);
  useEffect(() => {
    if (!session || initialised.current) return;
    initialised.current = true;

    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get(MAILBOX_PARAM);
    const chosen = pickActiveMailbox(
      session.mailboxes.map((mailbox) => mailbox.id),
      { fromUrl, fromTab: readTabMailbox(demo), remembered: session.activeMailboxId },
    );
    enter(chosen);

    const error = mailboxErrorMessage(url.searchParams.get(MAILBOX_ERROR_PARAM));
    const status = mailboxStatusMessage(url.searchParams.get(MAILBOX_STATUS_PARAM));
    if (error) setNotice({ tone: "warning", text: error });
    else if (status) setNotice({ tone: "success", text: status });

    if ([MAILBOX_PARAM, MAILBOX_ERROR_PARAM, MAILBOX_STATUS_PARAM].some((key) => url.searchParams.has(key))) {
      for (const key of [MAILBOX_PARAM, MAILBOX_ERROR_PARAM, MAILBOX_STATUS_PARAM]) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", url);
    }
  }, [session, demo, enter]);

  // The tab's mailbox was removed (here or in another tab): move to one that remains.
  useEffect(() => {
    if (!session || !scope?.mailboxId) return;
    if (session.mailboxes.some((mailbox) => mailbox.id === scope.mailboxId)) return;
    const next = pickActiveMailbox(
      session.mailboxes.map((mailbox) => mailbox.id),
      { remembered: session.activeMailboxId },
    );
    enter(next);
    setNotice({
      tone: "warning",
      text: next
        ? "That mailbox is no longer connected, so you’re now looking at another one."
        : "That mailbox is no longer connected. Connect Gmail to carry on.",
    });
  }, [session, scope, enter]);

  const active = useMemo(
    () => mailboxes.find((mailbox) => mailbox.id === scope?.mailboxId) ?? null,
    [mailboxes, scope],
  );

  const switchTo = useCallback(
    (mailboxId: string) => {
      if (mailboxId === scopeRef.current?.mailboxId) return;
      if (!mailboxes.some((mailbox) => mailbox.id === mailboxId)) return;

      // Stay on this page, but drop anything that pointed inside the old mailbox.
      const url = new URL(window.location.href);
      let changed = false;
      for (const key of MAILBOX_SPECIFIC_PARAMS) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (changed) window.history.replaceState(window.history.state, "", url);

      setNotice(null);
      enter(mailboxId);
      // Remembered for the next visit; a failure here changes nothing now.
      void base.post("/api/mailboxes/active", { mailboxId }).catch(() => {});
    },
    [mailboxes, enter, base],
  );

  const rename = useCallback(
    async (mailboxId: string, label: string | null) => {
      const updated = await base.patch<MailboxDto>(`/api/mailboxes/${encodeURIComponent(mailboxId)}`, { label });
      setMailboxes(mailboxes.map((mailbox) => (mailbox.id === updated.id ? updated : mailbox)));
      return updated;
    },
    [base, mailboxes, setMailboxes],
  );

  const remove = useCallback(
    async (mailboxId: string) => {
      const result = await base.del<MailboxesResponse & { removed: string }>(
        `/api/mailboxes/${encodeURIComponent(mailboxId)}`,
      );
      const removed = mailboxes.find((mailbox) => mailbox.id === mailboxId);
      if (mailboxId === scopeRef.current?.mailboxId) {
        // Leave it before the list changes, so nothing reads a mailbox that is gone.
        const next = pickActiveMailbox(
          result.mailboxes.map((mailbox) => mailbox.id),
          { remembered: result.activeMailboxId },
        );
        enter(next);
      }
      setMailboxes(result.mailboxes, result.activeMailboxId);
      setNotice({
        tone: "success",
        text: `${removed ? mailboxTitle(removed) : "The mailbox"} was disconnected. Your Tidely account${
          result.mailboxes.length ? " and other mailboxes are" : " is"
        } still here.`,
      });
    },
    [base, mailboxes, enter, setMailboxes],
  );

  const isBusy = useCallback(() => busy.current.count > 0, []);

  const beginOperation = useCallback(() => {
    const generation = busy.current.generation;
    busy.current.count += 1;
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      if (busy.current.generation === generation) busy.current.count = Math.max(0, busy.current.count - 1);
    };
  }, []);

  const ready = Boolean(session) && scope !== null;

  const mailboxContext: MailboxContextValue = {
    mailboxes,
    active,
    loading: !ready,
    demo,
    basePath,
    switchTo,
    isBusy,
    refresh,
    rename,
    remove,
  };

  // Every request below the boundary names this scope's mailbox.
  const client = useMemo(
    () =>
      scope
        ? createMailboxClient(base, scope.mailboxId, {
            signal: scope.controller.signal,
            onMailboxGone: () => void refresh(),
          })
        : base,
    [base, scope, refresh],
  );

  const frame = {
    basePath,
    navItems,
    banner,
    demo,
    notice,
    onDismissNotice: () => setNotice(null),
    account: {
      name: user?.name ?? null,
      email: user?.email ?? null,
      onSignOut: () => void signOut(),
      signOutLabel,
    },
  };

  return (
    <MailboxContext.Provider value={mailboxContext}>
      {ready && scope ? (
        <ApiProvider key={scope.generation} client={client}>
          <MailboxOperationContext.Provider value={beginOperation}>
            <MailboxScope
              {...frame}
              mailbox={active}
              userName={user?.name ?? null}
              connected={loading ? null : Boolean(scope.mailboxId)}
            >
              {children}
            </MailboxScope>
          </MailboxOperationContext.Provider>
        </ApiProvider>
      ) : (
        <Frame {...frame} cleanupCount={null}>
          <p className={styles.loading} role="status">
            Loading your mailbox…
          </p>
        </Frame>
      )}
    </MailboxContext.Provider>
  );
}

type FrameProps = {
  children: ReactNode;
  basePath: string;
  navItems?: NavItem[];
  banner?: ReactNode;
  demo: boolean;
  notice: Notice | null;
  onDismissNotice: () => void;
  cleanupCount: number | null;
  account: {
    name: string | null;
    email: string | null;
    onSignOut: () => void;
    signOutLabel?: string;
  };
};

/** Everything for one mailbox. Remounted whenever the tab switches mailbox. */
function MailboxScope({
  mailbox,
  userName,
  connected,
  ...frame
}: Omit<FrameProps, "cleanupCount"> & {
  mailbox: MailboxDto | null;
  userName: string | null;
  connected: boolean | null;
}) {
  const { stats, refresh } = useStats();

  return (
    <AppContext.Provider
      value={{
        stats,
        refreshStats: refresh,
        accountEmail: mailbox?.email ?? null,
        mailbox,
        userName,
        accountConnected: connected,
        basePath: frame.basePath,
        demo: frame.demo,
      }}
    >
      <Frame {...frame} cleanupCount={stats?.activeSenders ?? null} />
    </AppContext.Provider>
  );
}

function Frame({
  children,
  basePath,
  navItems,
  banner,
  notice,
  onDismissNotice,
  cleanupCount,
  account,
}: FrameProps) {
  return (
    <div className={`${theme.theme} ${styles.shell}`}>
      <Sidebar
        basePath={basePath}
        items={navItems}
        cleanupCount={cleanupCount}
        account={account}
        switcher={<MailboxSwitcher placement="sidebar" />}
      />

      <div className={styles.body}>
        {/* Phones only: the sidebar is a bottom tab bar there, so the brand,
            the mailbox and the account need somewhere to live. */}
        <header className={styles.mobileBar}>
          <Link href={basePath || "/dashboard"} className={styles.mobileBrand} aria-label="Tidely home">
            <span className={styles.mobileMark} aria-hidden="true">
              <Mails size={18} strokeWidth={1.9} />
            </span>
            <span className={styles.mobileWord}>tidely.</span>
          </Link>
          <div className={styles.mobileMailbox}>
            <MailboxSwitcher placement="bar" />
          </div>
          <AccountMenu {...account} placement="down" compact />
        </header>

        {banner}
        {notice ? (
          <div className={styles.notice} data-tone={notice.tone} role="status">
            {notice.tone === "success" ? (
              <CircleCheck size={17} strokeWidth={2} aria-hidden />
            ) : (
              <CircleAlert size={17} strokeWidth={2} aria-hidden />
            )}
            <p>{notice.text}</p>
            <button type="button" onClick={onDismissNotice} aria-label="Dismiss">
              <X size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
        ) : null}
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
