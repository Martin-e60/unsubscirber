"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { FILTER_LABEL } from "@/components/senders/senderStatus";
import { SENDER_STATUS, type SenderStatus } from "@/lib/constants";
import type { SenderCountsDto, SenderSort } from "@/lib/api/types";
import styles from "./SenderToolbar.module.css";

/** Filter tabs, search, sort, and the bulk action bar. */

const TABS: (SenderStatus | "ALL")[] = [
  SENDER_STATUS.ACTIVE,
  SENDER_STATUS.MANUAL,
  SENDER_STATUS.UNSUBSCRIBED,
  SENDER_STATUS.REQUESTED,
  SENDER_STATUS.KEPT,
  SENDER_STATUS.FAILED,
  "ALL",
];

export function SenderToolbar({
  status,
  counts,
  onStatusChange,
  showTabs = true,
  tabs = TABS,
  search,
  onSearchChange,
  sort,
  onSortChange,
  allSelected,
  selectedCount,
  onToggleAll,
  onUnsubscribeSelected,
  onKeepSelected,
  working,
  demo = false,
}: {
  status: SenderStatus | "ALL";
  counts: SenderCountsDto;
  onStatusChange: (next: SenderStatus | "ALL") => void;
  showTabs?: boolean;
  tabs?: (SenderStatus | "ALL")[];
  search: string;
  onSearchChange: (next: string) => void;
  sort: SenderSort;
  onSortChange: (next: SenderSort) => void;
  allSelected: boolean;
  selectedCount: number;
  onToggleAll: () => void;
  onUnsubscribeSelected: () => void;
  onKeepSelected: () => void;
  working: boolean;
  /** Softens the warning wording where nothing is actually sent. */
  demo?: boolean;
}) {
  /**
   * Unsubscribing in bulk is the one action here that cannot be taken back, so
   * it asks first. The confirmation states what will happen rather than just
   * saying "are you sure", and it resets whenever the selection changes so a
   * pending confirm can never apply to a different set of senders.
   */
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setConfirming(false);
  }, [selectedCount, status, search]);

  return (
    <div className={styles.toolbar}>
      {showTabs ? (
        <div className={styles.tabs} role="tablist" aria-label="Filter subscriptions">
          {tabs.map((tab) => {
            const count = tab === "ALL" ? undefined : counts[tab];
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={status === tab}
                className={styles.tab}
                data-active={status === tab || undefined}
                onClick={() => onStatusChange(tab)}
              >
                {FILTER_LABEL[tab]}
                {count !== undefined && count > 0 ? (
                  <span className={styles.count}>{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <Search className={styles.searchIcon} size={16} strokeWidth={1.75} aria-hidden />
          <label className="srOnly" htmlFor="sender-search">
            Search senders
          </label>
          <input
            id="sender-search"
            type="search"
            className={styles.search}
            placeholder="Search by name or address"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        <Select
          id="sender-sort"
          label="Sort senders"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SenderSort)}
        >
          <option value="count">Most emails</option>
          <option value="recent">Most recent</option>
          <option value="name">Name A–Z</option>
        </Select>
      </div>

      <div className={styles.actions}>
        <Checkbox
          label="Select all"
          checked={allSelected}
          indeterminate={selectedCount > 0 && !allSelected}
          onChange={onToggleAll}
        />

        {selectedCount > 0 ? (
          confirming ? (
            <div className={styles.confirm} role="group" aria-label="Confirm unsubscribe">
              <p className={styles.confirmText}>
                {demo ? (
                  <>
                    Unsubscribe {selectedCount}{" "}
                    {selectedCount === 1 ? "sender" : "senders"}? In the demo
                    nothing is sent — the outcomes are simulated.
                  </>
                ) : (
                  <>
                    Unsubscribe {selectedCount}{" "}
                    {selectedCount === 1 ? "sender" : "senders"}? This sends real
                    requests on your behalf and cannot be undone.
                  </>
                )}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={working}
                onClick={() => {
                  setConfirming(false);
                  onUnsubscribeSelected();
                }}
              >
                Yes, unsubscribe {selectedCount}
              </Button>
            </div>
          ) : (
            <>
              <span className={styles.selected}>{selectedCount} selected</span>
              <Button
                variant="softSuccess"
                size="sm"
                onClick={onKeepSelected}
                disabled={working}
              >
                Keep
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={working}
                onClick={() => setConfirming(true)}
              >
                Unsubscribe {selectedCount}
              </Button>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}
