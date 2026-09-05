"use client";

import { useCallback } from "react";
import { ScanPanel } from "./ScanPanel";
import { SenderToolbar } from "./SenderToolbar";
import { SenderList } from "./SenderList";
import { ResultSummary } from "./ResultSummary";
import { useApp } from "./AppShell";
import { useScan } from "@/hooks/useScan";
import { useSenders } from "@/hooks/useSenders";
import { useUnsubscribe } from "@/hooks/useUnsubscribe";
import type { SenderFilter } from "@/hooks/useSenders";
import styles from "./SenderWorkspace.module.css";

/**
 * The subscription list screen.
 *
 * Cleanup, Senders, Rollups and Unsubscribed are all this component with
 * different starting filters — one implementation to fix, one to restyle,
 * rather than four that drift apart.
 */

export function SenderWorkspace({
  initialStatus,
  initialSearch = "",
  showTabs = true,
  showScan = false,
  emptyTitle,
  emptyDescription,
}: {
  initialStatus: SenderFilter;
  initialSearch?: string;
  showTabs?: boolean;
  showScan?: boolean;
  emptyTitle: string;
  emptyDescription?: string;
}) {
  const { refreshStats } = useApp();
  const senders = useSenders({ initialStatus, initialSearch });

  const scan = useScan({
    onFinished: () => {
      void senders.refresh();
      void refreshStats();
    },
  });

  const unsubscribe = useUnsubscribe({
    onResult: (id, patch) => senders.patchSender(id, patch),
  });

  const runUnsubscribe = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      await unsubscribe.run(ids);
      senders.clearSelection();
      // Statuses changed on the server; resync the tabs and the health meter.
      void senders.refresh();
      void refreshStats();
    },
    [unsubscribe, senders, refreshStats],
  );

  const applyToSelection = useCallback(
    async (action: (id: string) => Promise<void>) => {
      const ids = [...senders.selected];
      await Promise.all(ids.map(action));
      senders.clearSelection();
      void refreshStats();
    },
    [senders, refreshStats],
  );

  return (
    <div className={styles.workspace}>
      {showScan ? (
        <ScanPanel
          progress={scan.progress}
          running={scan.running}
          error={scan.error}
          onStart={(days) => void scan.start(days)}
          onCancel={scan.cancel}
        />
      ) : null}

      <ResultSummary
        unsubscribed={unsubscribe.summary.unsubscribed}
        manual={unsubscribe.summary.manual}
        failed={unsubscribe.summary.failed}
        onDismiss={unsubscribe.reset}
      />

      <SenderToolbar
        status={senders.status}
        counts={senders.counts}
        onStatusChange={senders.setStatus}
        showTabs={showTabs}
        search={senders.search}
        onSearchChange={senders.setSearch}
        sort={senders.sort}
        onSortChange={senders.setSort}
        allSelected={senders.allSelected}
        selectedCount={senders.selectedCount}
        onToggleAll={senders.toggleAll}
        onUnsubscribeSelected={() => void runUnsubscribe([...senders.selected])}
        onKeepSelected={() => void applyToSelection(senders.keepSender)}
        onRollUpSelected={() => void applyToSelection(senders.rollUpSender)}
        working={unsubscribe.running}
      />

      {senders.error ? <p className={styles.error}>{senders.error}</p> : null}

      <SenderList
        senders={senders.senders}
        loading={senders.loading}
        selected={senders.selected}
        pending={unsubscribe.pending}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        onToggle={senders.toggle}
        onUnsubscribe={(id) => void runUnsubscribe([id])}
        onKeep={(id) => void senders.keepSender(id).then(refreshStats)}
        onRollUp={(id) => void senders.rollUpSender(id).then(refreshStats)}
        onRestore={(id) => void senders.restoreSender(id).then(refreshStats)}
      />
    </div>
  );
}
