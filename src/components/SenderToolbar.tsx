"use client";

import { Search } from "lucide-react";
import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Checkbox";
import { Select } from "./ui/Select";
import { FILTER_LABEL } from "./senderStatus";
import { SENDER_STATUS, type SenderStatus } from "@/lib/constants";
import type { SenderCountsDto, SenderSort } from "@/lib/api/types";
import styles from "./SenderToolbar.module.css";

/** Filter tabs, search, sort, and the bulk action bar. */

const TABS: (SenderStatus | "ALL")[] = [
  SENDER_STATUS.ACTIVE,
  SENDER_STATUS.MANUAL,
  SENDER_STATUS.ROLLED_UP,
  SENDER_STATUS.UNSUBSCRIBED,
  SENDER_STATUS.KEPT,
  SENDER_STATUS.FAILED,
  "ALL",
];

export function SenderToolbar({
  status,
  counts,
  onStatusChange,
  showTabs = true,
  search,
  onSearchChange,
  sort,
  onSortChange,
  allSelected,
  selectedCount,
  onToggleAll,
  onUnsubscribeSelected,
  onKeepSelected,
  onRollUpSelected,
  working,
}: {
  status: SenderStatus | "ALL";
  counts: SenderCountsDto;
  onStatusChange: (next: SenderStatus | "ALL") => void;
  showTabs?: boolean;
  search: string;
  onSearchChange: (next: string) => void;
  sort: SenderSort;
  onSortChange: (next: SenderSort) => void;
  allSelected: boolean;
  selectedCount: number;
  onToggleAll: () => void;
  onUnsubscribeSelected: () => void;
  onKeepSelected: () => void;
  onRollUpSelected: () => void;
  working: boolean;
}) {
  return (
    <div className={styles.toolbar}>
      {showTabs ? (
        <div className={styles.tabs} role="tablist" aria-label="Filter subscriptions">
          {TABS.map((tab) => {
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
              variant="softPrimary"
              size="sm"
              onClick={onRollUpSelected}
              disabled={working}
            >
              Roll up
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={working}
              onClick={onUnsubscribeSelected}
            >
              Unsubscribe {selectedCount}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
