"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/api/context";
import type { ClearOutMessageDto } from "@/lib/api/types";
import { emails } from "@/lib/clearout/actions";
import type { RunProgress } from "@/hooks/useClearOut";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { listDate } from "./format";
import { senderLabel } from "./MessageList";
import { Sheet } from "./Sheet";
import buttons from "@/components/cleanup/buttons.module.css";
import styles from "./Dialogs.module.css";

/**
 * The review before Archive or Move to Trash.
 *
 * It names the action, the exact number, and lists the emails — the ones
 * already on screen at once, the rest a page at a time — so the person sees
 * what will change. The ids were frozen when this opened: mail that arrives
 * meanwhile is never added. Confirm cannot be pressed twice; while running,
 * the dialog cannot be dismissed, only asked to stop after the current batch.
 */

const PAGE = 50;

const COPY = {
  archive: {
    title: (n: number) => `Archive ${emails(n)}?`,
    body: "They’ll leave your Inbox but stay in All mail, in search and under their labels. Archiving doesn’t free up storage. Emails already out of the Inbox stay as they are.",
    confirm: (n: number) => `Archive ${emails(n)}`,
    working: "Archiving",
  },
  trash: {
    title: (n: number) => `Move ${emails(n)} to Trash?`,
    body: "They’ll move to Gmail’s Trash. You can restore them from there for 30 days, after which Gmail deletes them for good. Tidely never deletes anything permanently.",
    confirm: (n: number) => `Move ${emails(n)} to Trash`,
    working: "Moving to Trash",
  },
} as const;

export function ReviewDialog({
  action,
  ids,
  known,
  progress,
  demo,
  onConfirm,
  onCancel,
  onStop,
}: {
  action: "archive" | "trash" | null;
  ids: string[];
  known: Map<string, ClearOutMessageDto>;
  progress: RunProgress | null;
  demo: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onStop: () => void;
}) {
  const api = useApi();
  const [rows, setRows] = useState<ClearOutMessageDto[]>([]);
  const [shown, setShown] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stopping, setStopping] = useState(false);
  const confirmedAt = useRef(0);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const open = action !== null;
  const running = progress !== null && (progress.action === "archive" || progress.action === "trash");

  const loadMore = useCallback(
    async (from: number) => {
      const slice = ids.slice(from, from + PAGE);
      if (slice.length === 0) return;
      const missing = slice.filter((id) => !known.has(id));
      setLoadingMore(missing.length > 0);
      let fetched: ClearOutMessageDto[] = [];
      if (missing.length) {
        try {
          fetched = await api.post<ClearOutMessageDto[]>("/api/clear-out/summaries", { ids: missing });
        } catch {
          fetched = [];
        }
      }
      const byId = new Map(fetched.map((m) => [m.id, m]));
      const next = slice.map((id) => known.get(id) ?? byId.get(id)).filter((m): m is ClearOutMessageDto => Boolean(m));
      setRows((current) => [...current, ...next]);
      setShown(from + slice.length);
      setLoadingMore(false);
    },
    [api, ids, known],
  );

  useEffect(() => {
    if (!open) return;
    setRows([]);
    setShown(0);
    setStopping(false);
    void loadMore(0);
    // Cancel first: the safe answer is where focus starts.
    window.setTimeout(() => cancelRef.current?.focus(), 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = action ? COPY[action] : COPY.archive;
  const count = ids.length;
  const unlisted = shown - rows.length;

  return (
    <Sheet
      open={open}
      onClose={onCancel}
      locked={running}
      title={copy.title(count)}
      description={
        <>
          {copy.body}
          {demo ? " In the demo this changes only sample data in your browser." : ""}
        </>
      }
      footer={
        running ? (
          <div className={styles.running} role="status">
            <div className={styles.runningText}>
              <span>
                {copy.working}… {progress.done.toLocaleString("en")} of {progress.total.toLocaleString("en")}
              </span>
              {progress.total > progress.done && progress.total > 50 ? (
                <button
                  type="button"
                  className={`${buttons.quiet} ${buttons.small}`}
                  disabled={stopping}
                  onClick={() => {
                    setStopping(true);
                    onStop();
                  }}
                >
                  {stopping ? "Stopping after this batch…" : "Stop after this batch"}
                </button>
              ) : null}
            </div>
            <ProgressBar value={progress.total ? progress.done / progress.total : 0} label={copy.working} />
          </div>
        ) : (
          <>
            <button ref={cancelRef} type="button" className={`${buttons.secondary} ${buttons.small}`} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={`${buttons.primary} ${buttons.small}`}
              disabled={count === 0}
              onClick={() => {
                // One press only; a double click cannot start a second run.
                if (Date.now() - confirmedAt.current < 1000) return;
                confirmedAt.current = Date.now();
                onConfirm();
              }}
            >
              {copy.confirm(count)}
            </button>
          </>
        )
      }
    >
      <p className={styles.listLabel} id="review-list-label">
        {count > rows.length ? `Showing ${rows.length.toLocaleString("en")} of ${emails(count)}` : `The ${emails(count)}`}
      </p>
      <ul className={styles.reviewList} aria-labelledby="review-list-label">
        {rows.map((message) => (
          <li key={message.id} className={styles.reviewRow}>
            <span className={styles.reviewSender}>{senderLabel(message)}</span>
            <span className={styles.reviewSubject}>{message.subject ?? "(no subject)"}</span>
            <span className={styles.reviewDate}>{listDate(message.receivedAt)}</span>
          </li>
        ))}
      </ul>
      {unlisted > 0 ? (
        <p className={styles.note}>
          {emails(unlisted)} couldn’t be shown here — they may have changed since you selected them. They’re still part of
          this action.
        </p>
      ) : null}
      {shown < count ? (
        <button
          type="button"
          className={`${buttons.secondary} ${buttons.small} ${styles.more}`}
          onClick={() => void loadMore(shown)}
          disabled={loadingMore || running}
        >
          {loadingMore ? "Loading…" : `Show ${Math.min(PAGE, count - shown)} more`}
        </button>
      ) : null}
    </Sheet>
  );
}
