"use client";

import { useRef, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { ChevronLeft, ChevronRight, Paperclip } from "lucide-react";
import { toInitials } from "@/components/ui/Avatar";
import type { ClearOutMessageDto } from "@/lib/api/types";
import { listDate } from "./format";
import styles from "./MessageList.module.css";

/**
 * Clear out's list: one row per message.
 *
 * As in Cleanup, the checkbox and the row are separate controls: the
 * checkbox selects, the row opens a preview. Ticking never opens anything,
 * and opening never marks anything as read.
 *
 * The header row, the row area and the footer are always rendered, whatever
 * the state, so the row area keeps one height: on wide screens the page
 * measures it to decide how many emails a page holds.
 */

export function senderLabel(message: ClearOutMessageDto): string {
  if (message.sentByMe) return message.to ? `To: ${message.to}` : "Sent by you";
  return message.fromName ?? message.fromAddress ?? "Unknown sender";
}

export function MessageList({
  messages,
  loading,
  selected,
  locked,
  skeletonRows,
  areaRef,
  onToggle,
  onTogglePage,
  onOpen,
  empty,
  footer,
}: {
  messages: ClearOutMessageDto[];
  loading: boolean;
  selected: Set<string>;
  locked: boolean;
  /** How many placeholder rows fill the area while loading. */
  skeletonRows: number;
  /** The row area, measured by the page to size each page of results. */
  areaRef?: Ref<HTMLDivElement>;
  onToggle: (message: ClearOutMessageDto) => void;
  onTogglePage: () => void;
  onOpen: (message: ClearOutMessageDto) => void;
  empty: ReactNode;
  footer?: ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const pageChecked = messages.length > 0 && messages.every((m) => selected.has(m.id));
  const someChecked = messages.some((m) => selected.has(m.id));
  const now = new Date();
  const firstLoad = loading && messages.length === 0;

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const targets: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: messages.length - 1,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    const next = Math.min(messages.length - 1, Math.max(0, targets[event.key]));
    listRef.current?.querySelectorAll<HTMLButtonElement>("[data-message-id]")[next]?.focus();
  };

  let body: ReactNode;
  if (firstLoad) {
    body = (
      <>
        <ul className={styles.list} aria-hidden="true">
          {Array.from({ length: Math.max(1, skeletonRows) }, (_, index) => (
            <li key={index} className={styles.skeleton}>
              <span />
              <span />
              <span />
            </li>
          ))}
        </ul>
        <span className="srOnly" role="status">
          Loading emails
        </span>
      </>
    );
  } else if (messages.length === 0) {
    body = empty;
  } else {
    body = (
      <ul className={styles.list} ref={listRef} aria-label="Emails">
        {messages.map((message, index) => {
          const sender = senderLabel(message);
          const checked = selected.has(message.id);
          const subject = message.subject ?? "(no subject)";
          const date = listDate(message.receivedAt, now);
          const label = message.labels[0];
          const extraLabels = message.labels.length - 1;

          return (
            <li
              key={message.id}
              className={styles.row}
              data-checked={checked || undefined}
              data-unread={message.unread || undefined}
            >
              <label className={styles.check}>
                <input
                  type="checkbox"
                  className={styles.box}
                  checked={checked}
                  disabled={locked}
                  onChange={() => onToggle(message)}
                  aria-label={`Select email from ${sender}: ${subject}`}
                />
              </label>

              <button
                type="button"
                className={styles.open}
                data-message-id={message.id}
                onClick={() => onOpen(message)}
                onKeyDown={(event) => moveFocus(event, index)}
                aria-label={`${message.unread ? "Unread. " : ""}${sender}. ${subject}. ${date}.${
                  message.hasAttachment ? " Has attachments." : ""
                }${message.labels.length ? ` Labels: ${message.labels.map((l) => l.name).join(", ")}.` : ""} Open preview.`}
              >
                <span className={styles.sender}>
                  <span className={styles.avatar} aria-hidden="true">
                    {toInitials(message.sentByMe ? (message.to ?? "Me") : sender)}
                  </span>
                  <span className={styles.senderName}>{sender}</span>
                  <span className={styles.dot} aria-hidden="true" />
                </span>

                <span className={styles.email}>
                  <span className={styles.subject}>{subject}</span>
                  {message.snippet ? <span className={styles.snippet}>{message.snippet}</span> : null}
                </span>

                <span className={styles.marks} aria-hidden="true">
                  {label ? (
                    <span className={styles.label}>
                      {label.name}
                      {extraLabels > 0 ? ` +${extraLabels}` : ""}
                    </span>
                  ) : null}
                  {message.hasAttachment ? <Paperclip size={17} strokeWidth={1.8} className={styles.clip} /> : null}
                </span>

                <span className={styles.date}>{date}</span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className={styles.table} aria-busy={loading || undefined} data-refreshing={(loading && !firstLoad) || undefined}>
      <div className={styles.head}>
        <label className={styles.check}>
          <input
            id="clear-out-select-page"
            type="checkbox"
            className={styles.box}
            checked={pageChecked}
            disabled={locked || messages.length === 0}
            ref={(node) => {
              if (node) node.indeterminate = someChecked && !pageChecked;
            }}
            onChange={onTogglePage}
            aria-label={`Select the ${messages.length} ${messages.length === 1 ? "email" : "emails"} on this page`}
          />
        </label>
        <span className={styles.headLabel}>Sender</span>
        <span className={`${styles.headLabel} ${styles.headEmail}`}>Email</span>
        <span className={`${styles.headLabel} ${styles.headDate}`}>Date</span>
      </div>

      <div className={styles.area} ref={areaRef}>
        {body}
      </div>

      {footer}
    </div>
  );
}

/**
 * Previous and Next over Gmail's page tokens. Gmail can only move one page at
 * a time, so there are no page numbers to jump to; the range says where you
 * are, and "about" marks a total Gmail only estimated.
 */
export function Pagination({
  page,
  hasNext,
  pageSize,
  shown,
  total,
  totalExact,
  loading,
  note,
  onPage,
}: {
  page: number;
  hasNext: boolean;
  pageSize: number;
  shown: number;
  total: number;
  totalExact: boolean;
  loading: boolean;
  /** A caveat about this result, kept to one line. */
  note?: string | null;
  onPage: (page: number) => void;
}) {
  const first = page * pageSize + 1;
  const last = page * pageSize + shown;

  return (
    <nav className={styles.foot} aria-label="Pages">
      <p className={styles.showing}>
        {shown > 0 ? (
          <>
            Showing {first.toLocaleString("en")}–{last.toLocaleString("en")} of {totalExact ? "" : "about "}
            {total.toLocaleString("en")}
          </>
        ) : (
          " "
        )}
        {note ? (
          <span className={styles.footNote} title={note}>
            {" "}
            · {note}
          </span>
        ) : null}
      </p>
      <div className={styles.pages}>
        <button
          type="button"
          className={styles.pageButton}
          onClick={() => onPage(page - 1)}
          disabled={page === 0 || loading}
        >
          <ChevronLeft size={17} strokeWidth={1.9} aria-hidden />
          Previous
        </button>
        <button
          type="button"
          className={styles.pageButton}
          onClick={() => onPage(page + 1)}
          disabled={!hasNext || loading}
        >
          Next
          <ChevronRight size={17} strokeWidth={1.9} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
