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
  const { refreshStats, basePath, stats } = useApp();

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

  // A mailbox with no senders at all has not been scanned — a different thing
  // from a mailbox where everything has been dealt with.
  const nothingScanned = stats !== null && stats.totalSenders === 0;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Quick cleanup</h2>
          <p className={styles.subtitle}>
            {senders.total > 0
              ? `${senders.total.toLocaleString()} ${
                  senders.total === 1 ? "sender is" : "senders are"
                } still waiting on a decision.`
              : nothingScanned
                ? "Run a scan and the senders you can act on appear here."
                : "Nothing waiting on you right now."}
          </p>
        </div>

        <Link href={`${basePath}/cleanup`} className={styles.viewAll}>
          View all
        </Link>
      </div>

      <SenderList
        senders={senders.senders}
        loading={senders.loading}
        selected={senders.selected}
        pending={unsubscribe.pending}
        emptyTitle={nothingScanned ? "Nothing scanned yet" : "Nothing waiting on a decision"}
        emptyDescription={
          nothingScanned
            ? "Go to Cleanup and run your first scan. It looks back 30 days by default, and you can widen that."
            : "Every sender found so far has been dealt with. Scan further back from Cleanup to look for more."
        }
        onToggle={senders.toggle}
        onUnsubscribe={(id) => void unsubscribe.run([id]).then(afterChange)}
        onKeep={(id) => void senders.keepSender(id).then(afterChange)}
        onRestore={(id) => void senders.restoreSender(id).then(afterChange)}
      />
    </section>
  );
}
