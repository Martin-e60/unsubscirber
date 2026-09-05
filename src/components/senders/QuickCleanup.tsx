"use client";

import { useCallback } from "react";
import Link from "next/link";
import { SenderList } from "@/components/senders/SenderList";
import { useApp } from "@/components/layout/AppShell";
import { useSenders } from "@/hooks/useSenders";
import { useUnsubscribe } from "@/hooks/useUnsubscribe";
import { QUICK_CLEANUP_SIZE, SENDER_STATUS } from "@/lib/constants";
import styles from "./QuickCleanup.module.css";

/**
 * The Home screen's suggestion panel: the handful of senders filling your
 * inbox that you have not made a decision about yet, heaviest first.
 */

export function QuickCleanup() {
  const { refreshStats } = useApp();

  const senders = useSenders({
    initialStatus: SENDER_STATUS.ACTIVE,
    limit: QUICK_CLEANUP_SIZE,
  });

  const unsubscribe = useUnsubscribe({
    onResult: (id, patch) => senders.patchSender(id, patch),
  });

  const afterChange = useCallback(async () => {
    await senders.refresh();
    await refreshStats();
  }, [senders, refreshStats]);

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Quick cleanup</h2>
          <p className={styles.subtitle}>
            {senders.total > 0
              ? `We found ${senders.total.toLocaleString()} ${
                  senders.total === 1 ? "sender" : "senders"
                } you might not need anymore.`
              : "Nothing waiting on you right now."}
          </p>
        </div>

        <Link href="/cleanup" className={styles.viewAll}>
          View all
        </Link>
      </div>

      <SenderList
        senders={senders.senders}
        loading={senders.loading}
        selected={senders.selected}
        pending={unsubscribe.pending}
        emptyTitle="Your inbox is tidy"
        emptyDescription="Every sender we found has been dealt with. Run a scan from Cleanup to look further back."
        onToggle={senders.toggle}
        onUnsubscribe={(id) => void unsubscribe.run([id]).then(afterChange)}
        onKeep={(id) => void senders.keepSender(id).then(afterChange)}
        onRollUp={(id) => void senders.rollUpSender(id).then(afterChange)}
        onRestore={(id) => void senders.restoreSender(id).then(afterChange)}
      />
    </section>
  );
}
