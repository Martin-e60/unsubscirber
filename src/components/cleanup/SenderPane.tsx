"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { ArrowDownWideNarrow, Check, ChevronDown, ChevronLeft, ChevronRight, Heart, Inbox, Search, SlidersHorizontal, X } from "lucide-react";
import { toInitials } from "@/components/ui/Avatar";
import { Popover, menuKeys } from "@/components/clearout/Popover";
import pickers from "@/components/clearout/Pickers.module.css";
import { SENDER_STATUS } from "@/lib/constants";
import type { UnconfirmedStatus, CleanupView as View } from "@/lib/navigation";
import type { SenderDto, SenderSort } from "@/lib/api/types";
import glass from "@/components/home/glass.module.css";
import styles from "./SenderPane.module.css";

/**
 * The left-hand pane: the senders, and the way to choose whose mail is shown.
 *
 * Two separate things happen on a row, and they are kept apart on purpose:
 * pressing the row focuses that sender (the message pane then shows their
 * mail), and the checkbox marks it for a bulk subscription action. The
 * checkbox sits outside the row's button, so ticking never changes who is
 * focused, and focusing never ticks anything.
 *
 * "All emails" sits above the list. It is not a sender and has no checkbox:
 * it shows the whole mailbox, personal mail included.
 */

export const FOLLOW_UP: Record<UnconfirmedStatus, { label: string; short: string; empty: string }> = {
  MANUAL: { label: "Needs a click", short: "Needs a click", empty: "Nothing needs a click right now" },
  FAILED: { label: "Failed", short: "Failed", empty: "No failed attempts" },
  REQUESTED: { label: "Request sent", short: "Request sent", empty: "No requests waiting for an answer" },
};

const SORTS: { value: SenderSort; label: string }[] = [
  { value: "count", label: "Most emails" },
  { value: "recent", label: "Most recent" },
  { value: "name", label: "Name A–Z" },
];

export function SenderPane({
  view,
  tabRefs,
  reviewCount,
  keptCount,
  onView,
  followUp,
  followUps,
  onFollowUp,
  search,
  onSearch,
  sort,
  onSort,
  searchLabel,
  bar,
  allActive,
  onAll,
  senders,
  loading,
  activeId,
  checked,
  pending,
  locked,
  selectable,
  canCheck,
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  empty,
  onActivate,
  onToggle,
}: {
  view: View;
  tabRefs: { review: RefObject<HTMLButtonElement | null>; keeping: RefObject<HTMLButtonElement | null> };
  reviewCount: number | null;
  keptCount: number | null;
  onView: (view: View) => void;
  followUp: UnconfirmedStatus | null;
  followUps: { status: UnconfirmedStatus; count: number }[];
  onFollowUp: (status: UnconfirmedStatus | null) => void;
  search: string;
  onSearch: (value: string) => void;
  sort: SenderSort;
  onSort: (value: SenderSort) => void;
  searchLabel: string;
  /** The bulk-action bar, while senders are ticked. */
  bar: ReactNode;
  allActive: boolean;
  onAll: () => void;
  senders: SenderDto[];
  loading: boolean;
  activeId: string | null;
  checked: Set<string>;
  pending: Set<string>;
  /** True while a decision is being sent; boxes cannot change under it. */
  locked: boolean;
  /** False in Keeping: no checkboxes and no bulk selection at all. */
  selectable: boolean;
  canCheck: (sender: SenderDto) => boolean;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  empty: ReactNode;
  /** `open` is false when the arrow keys moved here, so nothing is fetched on the way past. */
  onActivate: (id: string, open: boolean) => void;
  onToggle: (id: string) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const filterRef = useRef<HTMLButtonElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const targets: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: senders.length - 1,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    const next = Math.min(senders.length - 1, Math.max(0, targets[event.key]));
    // Focus only: opening a sender fetches their mail, so Enter or a click does that.
    listRef.current?.querySelectorAll<HTMLButtonElement>("[data-sender-id]")[next]?.focus();
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next: View =
      event.key === "Home" ? "review" : event.key === "End" ? "keeping" : view === "review" ? "keeping" : "review";
    onView(next);
    tabRefs[next].current?.focus();
  };

  const statusFilters = view === "review";
  const activeFilters = followUp ? 1 : 0;
  const firstLoad = loading && senders.length === 0;
  const first = page * pageSize + 1;
  const last = page * pageSize + senders.length;
  const noun = view === "keeping" ? (total === 1 ? "kept sender" : "kept senders") : total === 1 ? "sender" : "senders";

  const body = firstLoad ? (
    <div aria-busy="true" className={styles.list}>
      <ul className={styles.skeletonList}>
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className={styles.skeletonRow} aria-hidden="true">
            <span />
            <span />
            <span />
          </li>
        ))}
      </ul>
      <span className="srOnly" role="status">
        Loading senders
      </span>
    </div>
  ) : senders.length === 0 ? (
    <div className={styles.list}>{empty}</div>
  ) : (
    <ul className={styles.list} ref={listRef} aria-label={view === "keeping" ? "Kept senders" : "Senders to review"} aria-busy={loading || undefined}>
      {senders.map((sender, index) => {
        const label = sender.name ?? sender.address;
        const active = sender.id === activeId;
        const busy = pending.has(sender.id) || sender.status === SENDER_STATUS.UNSUBSCRIBING;
        const status =
          busy
            ? "Sending request…"
            : sender.status === SENDER_STATUS.MANUAL || sender.status === SENDER_STATUS.FAILED || sender.status === SENDER_STATUS.REQUESTED
              ? FOLLOW_UP[sender.status].short
              : null;
        const frequency = `${sender.perMonth.toLocaleString("en")} ${sender.perMonth === 1 ? "email" : "emails"} / month`;

        return (
          <li key={sender.id} className={styles.row} data-active={active || undefined} data-busy={busy || undefined}>
            {selectable ? (
              <label className={styles.check}>
                <input
                  type="checkbox"
                  className={styles.box}
                  checked={checked.has(sender.id)}
                  disabled={locked || busy || !canCheck(sender)}
                  onChange={() => onToggle(sender.id)}
                  aria-label={`Select ${label}`}
                />
              </label>
            ) : (
              <span className={styles.keptSlot} aria-hidden="true">
                <Heart size={17} strokeWidth={1.8} />
              </span>
            )}

            <button
              type="button"
              className={styles.open}
              data-sender-id={sender.id}
              aria-current={active ? "true" : undefined}
              aria-label={`${label}. ${frequency}.${status ? ` ${status}.` : ""}`}
              onClick={() => onActivate(sender.id, true)}
              onKeyDown={(event) => moveFocus(event, index)}
            >
              <span className={styles.avatar} aria-hidden="true">
                {toInitials(label)}
              </span>
              <span className={styles.identity}>
                <span className={styles.name}>{label}</span>
                {status ? <span className={`${styles.meta} ${styles.status}`}>{status}</span> : null}
              </span>
              <span className={styles.count} aria-hidden="true">
                {sender.perMonth.toLocaleString("en")}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className={`${styles.pane} ${glass.card} ${glass.pane}`} aria-labelledby="senders-title">
      <div className={styles.head}>
        <h2 className={styles.title} id="senders-title">
          Senders
        </h2>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Cleanup views">
        {(["review", "keeping"] as const).map((id) => {
          const selected = view === id;
          const count = id === "review" ? reviewCount : keptCount;
          return (
            <button
              key={id}
              ref={tabRefs[id]}
              type="button"
              role="tab"
              id={`cleanup-tab-${id}`}
              aria-selected={selected}
              aria-controls="cleanup-sender-panel"
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              data-selected={selected || undefined}
              onClick={() => onView(id)}
              onKeyDown={onTabKey}
            >
              {id === "review" ? "To review" : "Keeping"}
              <span className={styles.tabCount}>{count === null ? "" : count.toLocaleString("en")}</span>
            </button>
          );
        })}
      </div>

      <div id="cleanup-sender-panel" role="tabpanel" aria-labelledby={`cleanup-tab-${view}`} className={styles.panel}>
        <div className={styles.tools} role="search">
          <div className={styles.field}>
            <Search className={styles.fieldIcon} size={19} strokeWidth={1.6} aria-hidden />
            <label className="srOnly" htmlFor="cleanup-sender-search">
              {searchLabel}
            </label>
            <input
              id="cleanup-sender-search"
              type="search"
              className={styles.input}
              placeholder="Find a sender…"
              autoComplete="off"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
            />
          </div>
          <div className={styles.toolRow}>
            <div className={`${styles.field} ${styles.sort}`}>
              <ArrowDownWideNarrow className={styles.fieldIcon} size={19} strokeWidth={1.6} aria-hidden />
              <label className="srOnly" htmlFor="cleanup-sender-sort">
                Sort senders
              </label>
              <select
                id="cleanup-sender-sort"
                className={`${styles.input} ${styles.select}`}
                value={sort}
                onChange={(event) => onSort(event.target.value as SenderSort)}
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className={styles.chevron} size={18} strokeWidth={1.75} aria-hidden />
            </div>
            {statusFilters ? (
              <div className={styles.anchor}>
                <button
                  ref={filterRef}
                  type="button"
                  className={`${styles.filters} ${glass.button}`}
                  data-active={activeFilters > 0 || undefined}
                  aria-haspopup="dialog"
                  aria-expanded={filtersOpen}
                  onClick={() => setFiltersOpen((open) => !open)}
                >
                  <SlidersHorizontal size={19} strokeWidth={1.6} aria-hidden />
                  Filters
                  {activeFilters > 0 ? <span className={styles.filterCount}>{activeFilters}</span> : null}
                </button>
                <Popover
                  open={filtersOpen}
                  onClose={() => setFiltersOpen(false)}
                  triggerRef={filterRef}
                  label="Show senders"
                  align="end"
                  width="19rem"
                >
                  <div role="menu" aria-label="Show senders" className={pickers.options} onKeyDown={menuKeys}>
                    {[
                      { status: null, label: "Waiting for a decision", count: reviewCount ?? 0 },
                      ...followUps.map((item) => ({ status: item.status, label: FOLLOW_UP[item.status].label, count: item.count })),
                    ].map((option) => {
                      const on = followUp === option.status;
                      return (
                        <button
                          key={option.status ?? "waiting"}
                          type="button"
                          role="menuitemradio"
                          aria-checked={on}
                          className={pickers.option}
                          data-on={on || undefined}
                          disabled={!on && option.count === 0 && option.status !== null}
                          onClick={() => {
                            setFiltersOpen(false);
                            filterRef.current?.focus();
                            onFollowUp(option.status);
                          }}
                        >
                          <span className={pickers.optionMark} aria-hidden="true">
                            {on ? <Check size={15} strokeWidth={2.4} /> : null}
                          </span>
                          <span className={pickers.optionText}>
                            <span className={pickers.optionName}>
                              {option.label} <span className={styles.optionCount}>{option.count.toLocaleString("en")}</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className={pickers.explain}>
                    Unsubscribe requests that still need something stay here until they are resolved. A request sent is not
                    a confirmed removal.
                  </p>
                </Popover>
              </div>
            ) : null}

          </div>
        </div>

        <button type="button" className={styles.all} data-active={allActive || undefined} aria-current={allActive ? "true" : undefined} onClick={onAll}>
          <span className={styles.allIcon} aria-hidden="true">
            <Inbox size={22} strokeWidth={1.5} />
          </span>
          <span className={styles.identity}>
            <span className={styles.name}>All emails</span>
            <span className={styles.meta}>Personal and subscription emails</span>
          </span>
        </button>

        <div className={styles.listWrap} data-bar={bar ? true : undefined}>
          {senders.length > 0 ? (
            <div className={styles.columns} aria-hidden="true">
              <span>Sender</span>
              <span>Emails / mo</span>
            </div>
          ) : null}
          {body}
          {bar}
        </div>

        <div className={styles.foot}>
          <p className={styles.range}>
            {pageCount <= 1
              ? `${total.toLocaleString("en")} ${noun}`
              : `${first}–${last} of ${total.toLocaleString("en")} ${noun}`}
          </p>
          {pageCount > 1 ? (
            <nav className={styles.pager} aria-label="Sender pages">
              <button type="button" className={styles.pageButton} disabled={page === 0 || loading} onClick={() => onPage(page - 1)} aria-label="Previous page">
                <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
              </button>
              <span className={styles.pageOf}>
                {page + 1} / {pageCount}
              </span>
              <button type="button" className={styles.pageButton} disabled={page >= pageCount - 1 || loading} onClick={() => onPage(page + 1)} aria-label="Next page">
                <ChevronRight size={18} strokeWidth={1.75} aria-hidden />
              </button>
            </nav>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * Bulk subscription actions for the ticked senders.
 *
 * Unsubscribing asks first, with focus on the safe answer. Remounted by the
 * page whenever the selection changes, so a pending question can never carry
 * over to a different set of senders.
 */
export function SenderBulkBar({
  count,
  unsubscribable,
  pageAll,
  working,
  demo,
  onKeep,
  onUnsubscribe,
  onClear,
  onSelectPage,
}: {
  count: number;
  /** How many of the ticked senders publish an unsubscribe method. */
  unsubscribable: number;
  pageAll: boolean;
  working: boolean;
  demo: boolean;
  onKeep: () => void;
  onUnsubscribe: () => void;
  onClear: () => void;
  onSelectPage: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  const shownAt = useRef(0);

  const ask = () => {
    shownAt.current = Date.now();
    setConfirming(true);
    // The safe answer first, so a second Enter on the same spot cannot confirm.
    window.setTimeout(() => cancelRef.current?.focus(), 0);
  };

  const cancel = () => {
    setConfirming(false);
    window.setTimeout(() => askRef.current?.focus(), 0);
  };

  if (confirming) {
    return (
      <div
        className={styles.bar}
        role="region"
        aria-label="Selected senders"
        onKeyDown={(event) => {
          if (event.key === "Escape") cancel();
        }}
      >
        <p className={styles.barText}>
          Unsubscribe {unsubscribable} {unsubscribable === 1 ? "sender" : "senders"}?{" "}
          {demo ? "In the demo nothing is sent — outcomes are simulated." : "This sends real requests on your behalf."}
          {unsubscribable < count
            ? ` ${count - unsubscribable} without an unsubscribe method will be skipped.`
            : ""}
        </p>
        <div className={styles.barActions}>
          <button ref={cancelRef} type="button" className={`${styles.barButton} ${glass.button}`} onClick={cancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.barButton} ${styles.barPrimary}`}
            disabled={working}
            onClick={() => {
              // A double press on "Unsubscribe" must not land here and skip the question.
              if (Date.now() - shownAt.current < 400) return;
              onUnsubscribe();
            }}
          >
            Yes, unsubscribe {unsubscribable}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.bar} role="region" aria-label="Selected senders">
      <div className={styles.barHead}>
        <p className={styles.barText}>
          <strong>{count}</strong> selected
          <span className={styles.barScope}> · this page</span>
        </p>
        {pageAll ? null : (
          <button type="button" className={styles.barLink} onClick={onSelectPage} disabled={working}>
            Select page
          </button>
        )}
        <button type="button" className={styles.barClear} onClick={onClear} aria-label="Clear sender selection" title="Clear sender selection">
          <X size={17} strokeWidth={1.9} aria-hidden />
        </button>
      </div>
      <div className={styles.barActions}>
        <button type="button" className={`${styles.barButton} ${glass.button}`} disabled={working} onClick={onKeep}>
          Keep selected
        </button>
        <button
          ref={askRef}
          type="button"
          className={`${styles.barButton} ${styles.barPrimary}`}
          disabled={working || unsubscribable === 0}
          title={unsubscribable === 0 ? "None of the selected senders publish an unsubscribe method." : undefined}
          onClick={ask}
        >
          Unsubscribe selected
        </button>
      </div>
    </div>
  );
}
