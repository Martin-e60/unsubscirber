"use client";

import Link from "next/link";
import { BarChart3, Mail, Clock } from "lucide-react";
import { StatCard } from "@/components/views/StatCard";
import { QuickCleanup } from "@/components/senders/QuickCleanup";
import { useApp } from "@/components/layout/AppShell";
import { formatDuration, greetingFor } from "@/components/senders/senderStatus";
import styles from "./HomeView.module.css";

/** The Home screen: greeting, three headline numbers, and what to do next. */

export function HomeView() {
  const { stats, userName, accountEmail, basePath } = useApp();

  const firstName =
    userName?.split(/\s+/)[0] ?? accountEmail?.split("@")[0] ?? "there";

  /**
    * What to say under the greeting.
    *
    * A mailbox that has never been scanned is not a tidy mailbox, so it gets the
    * next step instead of a compliment. Until the stats have loaded it says
    * nothing rather than guessing.
    */
  const nothingFound = stats !== null && stats.totalSenders === 0;

  return (
    <div className={styles.page}>
      <header className={styles.greeting}>
        <div>
          <h1 className={styles.title}>
            {greetingFor()}, {firstName} <span aria-hidden="true">👋</span>
          </h1>
          <p className={styles.subtitle}>
            {stats === null ? (
              "Loading your numbers…"
            ) : nothingFound ? (
              <>
                Nothing scanned yet.{" "}
                <Link href={`${basePath}/cleanup`}>Run your first scan</Link> — it
                looks back 30 days by default.
              </>
            ) : stats.activeSenders > 0 ? (
              `${stats.activeSenders.toLocaleString()} ${
                stats.activeSenders === 1 ? "sender is" : "senders are"
              } waiting on a decision.`
            ) : (
              "Every sender found so far has a decision against it."
            )}
          </p>
        </div>
        <span className={styles.window}>Changes: last 30 days</span>
      </header>

      <div className={styles.stats}>
        <StatCard
          value={stats ? String(stats.inboxHealth) : "—"}
          label="Inbox Health"
          hint="Estimate: share of subscription volume you have decided about"
          delta={
            stats && stats.handledThisMonth > 0
              ? `${stats.handledThisMonth} this month`
              : undefined
          }
          icon={BarChart3}
          tone="primary"
        />
        <StatCard
          value={stats ? stats.emailsHandled.toLocaleString() : "—"}
          label="Emails handled"
          delta={
            stats && stats.emailsHandledDeltaPct !== null &&
            stats.emailsHandledDeltaPct > 0
              ? `${stats.emailsHandledDeltaPct}%`
              : undefined
          }
          icon={Mail}
          tone="success"
        />
        <StatCard
          value={stats ? formatDuration(stats.timeSavedSeconds) : "—"}
          label="Time saved"
          hint="Estimate: 5 seconds per email that no longer arrives"
          delta={
            stats && stats.timeSavedRecentSeconds > 0
              ? formatDuration(stats.timeSavedRecentSeconds)
              : undefined
          }
          icon={Clock}
          tone="danger"
        />
      </div>

      <QuickCleanup />
    </div>
  );
}
