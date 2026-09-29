"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toInitials } from "@/components/ui/Avatar";
import { SENDER_STATUS } from "@/lib/constants";
import type { SenderDto } from "@/lib/api/types";
import { receivedLabel } from "./format";
import styles from "./SenderTable.module.css";

/**
 * The senders waiting on a decision, one page at a time.
 *
 * Two separate things happen on a row, and they are kept apart on purpose:
 * pressing the row opens that sender in the details panel, and the checkbox
 * marks it for a bulk action. The checkbox sits outside the row's button, so
 * ticking it never changes which sender is open, and opening a sender never
 * decides anything about it.
 */

export function SenderTable({
  senders,
  loading,
  activeId,
  checked,
  pending,
  locked,
  page,
  pageCount,
  pageSize,
  total,
  empty,
  onActivate,
  onToggle,
  onTogglePage,
  onPage,
  selectable = true,
  canCheck,
  statusNote,
  listLabel = "Senders to review",
  noun = { one: "sender", many: "senders" },
  plainTotal = false,
}: {
  senders: SenderDto[];
  loading: boolean;
  activeId: string | null;
  checked: Set<string>;
  pending: Set<string>;
  /** True while a decision is being sent; boxes cannot change under it. */
  locked: boolean;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  empty: ReactNode;
  /** `open` is false when the arrow keys moved here, so phones do not jump. */
  onActivate: (id: string, open: boolean) => void;
  onToggle: (id: string) => void;
  onTogglePage: () => void;
  onPage: (page: number) => void;
  /** False in Keeping: no checkboxes and no bulk selection at all. */
  selectable?: boolean;
  /** Rows that cannot be ticked, e.g. a request already sent. */
  canCheck?: (sender: SenderDto) => boolean;
  /** Replaces the subject line with a status, for unsubscribe follow-ups. */
  statusNote?: (sender: SenderDto) => string | null;
  listLabel?: string;
  noun?: { one: string; many: string };
  /** When everything fits on one page, say only how many there are. */
  plainTotal?: boolean;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  const pageChecked = senders.length > 0 && senders.every((s) => checked.has(s.id));
  const someChecked = senders.some((s) => checked.has(s.id));

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const targets: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: senders.length - 1,
    };
    if (!(event.key in targets)) return;

    const next = Math.min(senders.length - 1, Math.max(0, targets[event.key]));
    event.preventDefault();
    if (next === index) return;

    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-sender-id]");
    buttons?.[next]?.focus();
    onActivate(senders[next].id, false);
  };

  if (loading && senders.length === 0) {
    return (
      <div className={styles.panel} aria-busy="true">
        <ul className={styles.list}>
          {Array.from({ length: 5 }, (_, index) => (
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
    );
  }

  if (senders.length === 0) {
    return <div className={styles.panel}>{empty}</div>;
  }

  const first = page * pageSize + 1;
  const last = page * pageSize + senders.length;

  return (
    <div className={styles.panel} aria-busy={loading || undefined} data-plain={!selectable || undefined}>
      <div className={styles.head}>
        {selectable ? (
        <label className={styles.check} title="Select every sender on this page">
          <input
            id="cleanup-select-page"
            type="checkbox"
            className={styles.box}
            checked={pageChecked}
            disabled={locked}
            ref={(node) => {
              if (node) node.indeterminate = someChecked && !pageChecked;
            }}
            onChange={onTogglePage}
            aria-label={`Select this page (${senders.length} ${senders.length === 1 ? "sender" : "senders"})`}
          />
        </label>
        ) : null}
        <span className={styles.headLabel}>Sender</span>
        <span className={`${styles.headLabel} ${styles.headNum}`}>Emails / mo</span>
        <span className={`${styles.headLabel} ${styles.headDate}`}>Last received</span>
      </div>

      <ul className={styles.list} ref={listRef} aria-label={listLabel}>
        {senders.map((sender, index) => {
          const label = sender.name ?? sender.address;
          const active = sender.id === activeId;
          const busy = pending.has(sender.id) || sender.status === SENDER_STATUS.UNSUBSCRIBING;
          const received = receivedLabel(sender.lastSeenAt);
          const note = busy ? "Sending unsubscribe request…" : statusNote?.(sender) ?? null;

          return (
            <li
              key={sender.id}
              className={styles.row}
              data-active={active || undefined}
              data-busy={busy || undefined}
            >
              {selectable ? (
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    className={styles.box}
                    checked={checked.has(sender.id)}
                    disabled={locked || busy || (canCheck ? !canCheck(sender) : false)}
                    onChange={() => onToggle(sender.id)}
                    aria-label={`Select ${label}`}
                  />
                </label>
              ) : null}

              <button
                type="button"
                className={styles.open}
                data-sender-id={sender.id}
                aria-current={active ? "true" : undefined}
                aria-label={`${label}. ${sender.perMonth} emails a month, last received ${received.toLowerCase()}.${
                  note ? ` ${note}` : ""
                }`}
                onClick={() => onActivate(sender.id, true)}
                onKeyDown={(event) => moveFocus(event, index)}
              >
                <span className={styles.avatar} aria-hidden="true">
                  {toInitials(label)}
                </span>
                <span className={styles.identity}>
                  <span className={styles.name}>{label}</span>
                  <span className={styles.subject} data-note={note ? true : undefined}>
                    {note ?? sender.sampleSubject ?? sender.address}
                  </span>
                </span>
                <span className={styles.num}>
                  {sender.perMonth.toLocaleString("en")}
                  <span className={styles.numUnit}> / mo</span>
                </span>
                <span className={styles.date}>{received}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className={styles.foot}>
        <p className={styles.range}>
          {plainTotal && pageCount <= 1
            ? `${total.toLocaleString("en")} ${total === 1 ? noun.one : noun.many}`
            : `${first}–${last} of ${total.toLocaleString("en")} ${total === 1 ? noun.one : noun.many}`}
        </p>
        {pageCount > 1 ? (
          <nav className={styles.pager} aria-label="Pages">
            <button
              type="button"
              className={styles.pageButton}
              disabled={page === 0 || loading}
              onClick={() => onPage(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
            </button>
            <span className={styles.pageOf}>
              {page + 1} / {pageCount}
            </span>
            <button
              type="button"
              className={styles.pageButton}
              disabled={page >= pageCount - 1 || loading}
              onClick={() => onPage(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={18} strokeWidth={1.75} aria-hidden />
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
