"use client";

import { BarChart3, Mail, Clock } from "lucide-react";
import { StatCard } from "@/components/views/StatCard";
import { QuickCleanup } from "@/components/senders/QuickCleanup";
import { useApp } from "@/components/layout/AppShell";
import { formatDuration, greetingFor } from "@/components/senders/senderStatus";
import styles from "./HomeView.module.css";

/** The Home screen: greeting, three headline numbers, and what to do next. */

export function HomeView() {
  const { stats, userName, accountEmail } = useApp();

  const firstName =
    userName?.split(/\s+/)[0] ?? accountEmail?.split("@")[0] ?? "there";

  return (
    <div className={styles.page}>
      <header className={styles.greeting}>
        <div>
          <h1 className={styles.title}>
            {greetingFor()}, {firstName} <span aria-hidden="true">👋</span>
          </h1>
          <p className={styles.subtitle}>
            {stats && stats.activeSenders > 0
              ? `${stats.activeSenders.toLocaleString()} ${
                  stats.activeSenders === 1 ? "sender is" : "senders are"
                } waiting on a decision.`
              : "Your inbox is looking better."}
          </p>
        </div>
        <span className={styles.window}>Last 30 days</span>
      </header>

      <div className={styles.stats}>
        <StatCard
          value={stats ? String(stats.inboxHealth) : "—"}
          label="Inbox Health"
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
