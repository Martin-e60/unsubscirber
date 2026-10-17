"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { useApp } from "@/components/layout/AppShell";
import { ScanOverview } from "@/components/home/ScanOverview";
import { Impact } from "@/components/home/Impact";
import { Activity, Attention } from "@/components/home/HomeCards";
import { useScan } from "@/hooks/useScan";
import { useHistory } from "@/hooks/useHistory";
import { buildActivity } from "@/lib/home/activity";
import styles from "./HomeView.module.css";

/**
 * Home, inside the app and the demo.
 *
 * Answers, top to bottom: when was my mailbox last scanned and how far along
 * is the review, what has this been worth, what is waiting on me, and what
 * happened recently. The sender list itself lives in Cleanup — Home points
 * there rather than repeating it.
 *
 * Every figure comes from the same API the rest of the app uses, so in the
 * demo it is the demo's sample data, and in a real account it is that
 * account's data. No figure from the design mock-up is carried over.
 */
export function HomeView() {
  const { stats, refreshStats, accountConnected, mailbox, basePath, demo } = useApp();
  const history = useHistory();

  const afterScan = useCallback(() => {
    void refreshStats();
    void history.refresh();
  }, [refreshStats, history]);

  const scan = useScan({ onFinished: afterScan, resume: false });

  const activity = useMemo(
    () =>
      history.items === null
        ? null
        : buildActivity({ history: history.items, scan: scan.progress }),
    [history.items, scan.progress],
  );

  return (
    <div className={styles.page}>
      {!demo && accountConnected && mailbox?.needsReconnect ? (
        <p className={styles.reconnect} role="status">
          <CircleAlert size={18} strokeWidth={1.75} aria-hidden />
          <span>
            Google stopped accepting access to {mailbox.email}, so it needs
            reconnecting.
          </span>
          <Link href="/settings#mailboxes">Manage mailboxes</Link>
        </p>
      ) : null}

      <ScanOverview connected={accountConnected} stats={stats} scan={scan} />

      {accountConnected === false ? null : (
        <>
          <Impact stats={stats} />

          <div className={styles.cards}>
            <Attention stats={stats} basePath={basePath} />
            <Activity items={activity} basePath={basePath} />
          </div>
        </>
      )}
    </div>
  );
}
