"use client";

import { useRef, useState } from "react";
import { Archive, ChevronDown, MailOpen, Tag, Trash2 } from "lucide-react";
import type { ClearOutLabelDto } from "@/lib/api/types";
import { emails } from "@/lib/clearout/actions";
import type { Resolving, RunProgress } from "@/hooks/useClearOut";
import { Popover, menuKeys } from "./Popover";
import glass from "@/components/home/glass.module.css";
import pickers from "./Pickers.module.css";
import styles from "./SelectionBar.module.css";

/**
 * The selected-emails toolbar: the exact count and what it covers, a way out,
 * "select all", and the four actions on those emails — Mark as read, Label,
 * Archive and Move to Trash. Archive and Move to Trash only open a review of
 * the exact emails; Mark as read and Label act straight away, since both are
 * undone just as easily in Gmail.
 *
 * It lives in a slot the pane always reserves, so appearing never moves the
 * list. None of these actions touches a sender's subscription.
 */
export function SelectionBar({
  count,
  scopeNote,
  pageState,
  labels,
  progress,
  resolving,
  selectAll,
  onCancelResolve,
  onClear,
  onMarkRead,
  onLabel,
  onOrganise,
  onStop,
}: {
  count: number;
  /** What the count covers: "on this page", "across pages", "all matching". */
  scopeNote: { short: string; long: string } | null;
  /** How much of the visible page is selected, for the master checkbox. */
  pageState: "none" | "some" | "all";
  labels: ClearOutLabelDto[] | null;
  progress: RunProgress | null;
  /** Gathering every matching email, with how many so far. */
  resolving: Resolving | null;
  /** Offered while there are matching emails not yet selected. */
  selectAll: { label: string; title: string; onClick: () => void } | null;
  onCancelResolve: () => void;
  onClear: () => void;
  onMarkRead: () => void;
  onLabel: (label: ClearOutLabelDto) => void;
  onOrganise: (action: "archive" | "trash") => void;
  onStop: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const labelRef = useRef<HTMLButtonElement>(null);
  const busy = progress !== null || resolving !== null;
  // Archive and Trash report their progress in the review dialog instead.
  const inlineProgress = progress && (progress.action === "mark_read" || progress.action === "label");

  return (
    <div className={styles.bar} role="region" aria-label="Selected emails">
      <div className={styles.summary}>
        <label className={styles.master}>
          <input
            type="checkbox"
            className={styles.box}
            checked={pageState === "all"}
            ref={(node) => {
              if (node) node.indeterminate = pageState === "some";
            }}
            disabled={progress !== null}
            onChange={onClear}
            aria-label="Clear the selection"
          />
        </label>
        <p className={styles.count} aria-live="polite">
          <strong>{count.toLocaleString("en")} selected</strong>
          {scopeNote ? (
            <span className={styles.scope} title={scopeNote.long}>
              {scopeNote.short}
              <span className="srOnly">: {scopeNote.long}</span>
            </span>
          ) : null}
        </p>
        <button type="button" className={styles.link} onClick={onClear} disabled={progress !== null}>
          Clear selection
        </button>
        {selectAll && !busy ? (
          <button type="button" className={styles.link} onClick={selectAll.onClick} title={selectAll.title}>
            {selectAll.label}
          </button>
        ) : null}
      </div>

      {resolving ? (
        <div className={styles.working} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <span>
            Finding matching emails… {resolving.found.toLocaleString("en")}
            {resolving.estimate > resolving.found ? ` of about ${resolving.estimate.toLocaleString("en")}` : ""}
          </span>
          <button type="button" className={styles.stop} onClick={onCancelResolve}>
            Cancel
          </button>
        </div>
      ) : inlineProgress ? (
        <div className={styles.working} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <span>
            {progress.action === "mark_read" ? "Marking as read" : "Adding label"}…{" "}
            {progress.done.toLocaleString("en")} of {progress.total.toLocaleString("en")}
          </span>
          {progress.total > 500 ? (
            <button type="button" className={styles.stop} onClick={onStop}>
              Stop
            </button>
          ) : null}
        </div>
      ) : (
        <div className={styles.actions} role="group" aria-label={`Actions for ${emails(count)}`}>
          <button type="button" className={`${styles.action} ${glass.button}`} onClick={onMarkRead} disabled={busy}>
            <MailOpen size={19} strokeWidth={1.6} aria-hidden />
            <span className={styles.text}>Mark as read</span>
          </button>

          <div className={styles.anchor}>
            <button
              ref={labelRef}
              type="button"
              className={`${styles.action} ${glass.button}`}
              aria-haspopup="dialog"
              aria-expanded={menu}
              onClick={() => setMenu((open) => !open)}
              disabled={busy}
            >
              <Tag size={19} strokeWidth={1.6} aria-hidden />
              <span className={styles.text}>Label</span>
              <ChevronDown size={17} strokeWidth={1.75} aria-hidden />
            </button>
            <Popover
              open={menu}
              onClose={() => setMenu(false)}
              triggerRef={labelRef}
              label="Add a label"
              align="end"
              width="17rem"
            >
              {labels === null ? (
                <p className={pickers.emptyNote}>Loading your labels…</p>
              ) : labels.length === 0 ? (
                <p className={pickers.emptyNote}>
                  You don’t have any labels yet. Create one in Gmail and it will appear here.
                </p>
              ) : (
                <div role="menu" aria-label="Your labels" className={pickers.options} onKeyDown={menuKeys}>
                  {labels.map((label) => (
                    <button
                      key={label.id}
                      type="button"
                      role="menuitem"
                      className={pickers.option}
                      onClick={() => {
                        setMenu(false);
                        onLabel(label);
                      }}
                    >
                      <Tag size={15} strokeWidth={1.8} aria-hidden />
                      <span className={pickers.optionText}>
                        <span className={pickers.optionName}>{label.name}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className={pickers.explain}>Adds the label. Other labels stay as they are.</p>
            </Popover>
          </div>

          <button
            type="button"
            className={`${styles.action} ${glass.button}`}
            onClick={() => onOrganise("archive")}
            disabled={busy}
            title="Remove from Inbox. Still in All mail. You’ll review the emails first."
          >
            <Archive size={19} strokeWidth={1.6} aria-hidden />
            <span className={styles.text}>Archive</span>
          </button>
          <button
            type="button"
            className={`${styles.action} ${glass.button}`}
            onClick={() => onOrganise("trash")}
            disabled={busy}
            title="Gmail empties Trash after 30 days. You’ll review the emails first."
          >
            <Trash2 size={19} strokeWidth={1.6} aria-hidden />
            <span className={styles.text}>Move to Trash</span>
          </button>
        </div>
      )}
    </div>
  );
}
