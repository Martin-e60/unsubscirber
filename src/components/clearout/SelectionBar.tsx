"use client";

import { useRef, useState } from "react";
import { Archive, Check, ChevronDown, MailOpen, Tag, Trash2 } from "lucide-react";
import type { ClearOutLabelDto } from "@/lib/api/types";
import { emails } from "@/lib/clearout/actions";
import type { Resolving, RunProgress } from "@/hooks/useClearOut";
import { Popover, menuKeys } from "./Popover";
import pickers from "./Pickers.module.css";
import styles from "./SelectionBar.module.css";

/**
 * The selected-emails toolbar: the exact count, a way out, "select all
 * matching", and the four actions. Archive and Move to Trash only open a
 * review; Mark as read and Label act straight away, since both are undone
 * just as easily in Gmail.
 *
 * It lives in a slot the page always reserves, so appearing never moves the
 * list. Its menus open upwards, into the space the list leaves above it.
 */
export function SelectionBar({
  count,
  scopeNote,
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
  /** "on this page" · "all matching your filters". */
  scopeNote: string | null;
  labels: ClearOutLabelDto[] | null;
  progress: RunProgress | null;
  /** Gathering every matching email, with how many so far. */
  resolving: Resolving | null;
  /** Offered once the whole page is selected and there is more. */
  selectAll: { label: string; onClick: () => void } | null;
  onCancelResolve: () => void;
  onClear: () => void;
  onMarkRead: () => void;
  onLabel: (label: ClearOutLabelDto) => void;
  onOrganise: (action: "archive" | "trash") => void;
  onStop: () => void;
}) {
  const [menu, setMenu] = useState<"label" | "organise" | null>(null);
  const labelRef = useRef<HTMLButtonElement>(null);
  const organiseRef = useRef<HTMLButtonElement>(null);
  const busy = progress !== null || resolving !== null;
  // Archive and Trash report their progress in the review dialog instead.
  const inlineProgress = progress && (progress.action === "mark_read" || progress.action === "label");

  return (
    <div className={styles.bar} role="region" aria-label="Selected emails">
      <div className={styles.summary}>
        <p className={styles.count} aria-live="polite">
          <strong>{emails(count)} selected</strong>
          {scopeNote ? <span className={styles.scope}>{scopeNote}</span> : null}
        </p>
        <span className={styles.rule} aria-hidden="true" />
        <button type="button" className={styles.clear} onClick={onClear} disabled={progress !== null}>
          Clear selection
        </button>
        {selectAll && !busy ? (
          <button type="button" className={styles.selectAll} onClick={selectAll.onClick} title={selectAll.label}>
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
        <div className={styles.actions}>
          <button type="button" className={styles.outline} onClick={onMarkRead} disabled={busy}>
            <MailOpen size={18} strokeWidth={1.8} aria-hidden />
            Mark as read
          </button>

          <div className={styles.anchor}>
            <button
              ref={labelRef}
              type="button"
              className={styles.outline}
              aria-haspopup="dialog"
              aria-expanded={menu === "label"}
              onClick={() => setMenu(menu === "label" ? null : "label")}
              disabled={busy}
            >
              <Tag size={18} strokeWidth={1.8} aria-hidden />
              Label
            </button>
            <Popover
              open={menu === "label"}
              onClose={() => setMenu(null)}
              triggerRef={labelRef}
              label="Add a label"
              placement="above"
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
                        setMenu(null);
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

          <div className={styles.anchor}>
            <button
              ref={organiseRef}
              type="button"
              className={styles.primary}
              aria-haspopup="menu"
              aria-expanded={menu === "organise"}
              onClick={() => setMenu(menu === "organise" ? null : "organise")}
              disabled={busy}
            >
              <span className={styles.long}>Organise selected</span>
              <span className={styles.short}>Organise</span>
              <ChevronDown size={18} strokeWidth={2} aria-hidden />
            </button>
            <Popover
              open={menu === "organise"}
              onClose={() => setMenu(null)}
              triggerRef={organiseRef}
              label="Organise selected"
              placement="above"
              align="end"
              width="20rem"
            >
              <div role="menu" aria-label="Organise selected" className={pickers.menuList} onKeyDown={menuKeys}>
                <button
                  type="button"
                  role="menuitem"
                  className={pickers.option}
                  onClick={() => {
                    setMenu(null);
                    onOrganise("archive");
                  }}
                >
                  <Archive size={18} strokeWidth={1.8} aria-hidden />
                  <span className={pickers.optionText}>
                    <span className={pickers.optionName}>Archive</span>
                    <span className={pickers.optionAddress}>Remove from Inbox. Still in All mail.</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={pickers.option}
                  onClick={() => {
                    setMenu(null);
                    onOrganise("trash");
                  }}
                >
                  <Trash2 size={18} strokeWidth={1.8} aria-hidden />
                  <span className={pickers.optionText}>
                    <span className={pickers.optionName}>Move to Trash</span>
                    <span className={pickers.optionAddress}>Gmail empties Trash after 30 days.</span>
                  </span>
                </button>
              </div>
              <p className={pickers.explain}>
                <Check size={13} strokeWidth={2.2} aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
                You’ll review the emails before anything changes.
              </p>
            </Popover>
          </div>
        </div>
      )}
    </div>
  );
}
