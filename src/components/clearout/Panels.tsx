"use client";

import { useEffect, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  CircleCheck,
  MailOpen,
  Paperclip,
  ShieldCheck,
  Tag,
  Trash2,
  Undo2,
} from "lucide-react";
import { useApi } from "@/lib/api/context";
import type { ClearOutMessageDto, ClearOutPreviewDto, ClearOutRunDto } from "@/lib/api/types";
import { emails, historyTitle } from "@/lib/clearout/actions";
import { fullDate, sizeLabel, whenLabel } from "./format";
import { Sheet } from "./Sheet";
import buttons from "@/components/cleanup/buttons.module.css";
import styles from "./Dialogs.module.css";

// --- Preview ----------------------------------------------------------------------

/**
 * Enough to recognise an email: who, when, where it is, and Gmail's own short
 * excerpt. The full message stays in Gmail; opening this changes nothing,
 * and in particular does not mark it as read.
 */
export function PreviewSheet({
  message,
  selected,
  demo,
  onToggle,
  onClose,
}: {
  message: ClearOutMessageDto | null;
  selected: boolean;
  demo: boolean;
  onToggle: (message: ClearOutMessageDto) => void;
  onClose: () => void;
}) {
  const api = useApi();
  const [detail, setDetail] = useState<ClearOutPreviewDto | null>(null);
  const [shown, setShown] = useState<ClearOutMessageDto | null>(message);

  // Keep the last message while the drawer closes, so it does not empty mid-fade.
  useEffect(() => {
    if (message) setShown(message);
  }, [message]);

  useEffect(() => {
    if (!message) return;
    let live = true;
    setDetail(null);
    api
      .get<ClearOutPreviewDto>(`/api/clear-out/messages/${encodeURIComponent(message.id)}`)
      .then((value) => live && setDetail(value))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, message]);

  const m: ClearOutMessageDto | null = detail && shown && detail.id === shown.id ? detail : shown;
  const cc = detail && m && detail.id === m.id ? detail.cc : null;

  return (
    <Sheet
      open={message !== null}
      onClose={onClose}
      variant="side"
      title={m?.subject ?? "(no subject)"}
      footer={
        m ? (
          <>
            <label className={`${buttons.secondary} ${buttons.small} ${styles.selectToggle}`}>
              <input type="checkbox" checked={selected} onChange={() => onToggle(m)} />
              Select this email
            </label>
            {m.gmailUrl ? (
              <a
                className={`${buttons.primary} ${buttons.small} ${styles.gmail}`}
                href={m.gmailUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open in Gmail
                <ArrowUpRight size={16} strokeWidth={2} aria-hidden />
              </a>
            ) : null}
          </>
        ) : null
      }
    >
      {m ? (
        <>
          <dl className={styles.facts}>
            <dt>From</dt>
            <dd>
              {m.fromName ? `${m.fromName} ` : ""}
              <span className={styles.address}>{m.fromName ? `<${m.fromAddress}>` : m.fromAddress}</span>
            </dd>
            {m.to ? (
              <>
                <dt>To</dt>
                <dd>{m.to}</dd>
              </>
            ) : null}
            {cc ? (
              <>
                <dt>Cc</dt>
                <dd>{cc}</dd>
              </>
            ) : null}
            <dt>Date</dt>
            <dd>{fullDate(m.receivedAt)}</dd>
            {m.sizeBytes !== null ? (
              <>
                <dt>Size</dt>
                <dd>About {sizeLabel(m.sizeBytes)}</dd>
              </>
            ) : null}
          </dl>

          <div className={styles.tags}>
            <span className={styles.tag}>{m.unread ? "Unread" : "Read"}</span>
            <span className={styles.tag}>{m.sentByMe ? "Sent" : m.inInbox ? "In Inbox" : "Archived"}</span>
            {m.hasAttachment ? (
              <span className={styles.tag}>
                <Paperclip size={13} strokeWidth={2} aria-hidden /> Attachments
              </span>
            ) : null}
            {m.labels.map((label) => (
              <span key={label.id} className={styles.tag} data-tone="label">
                {label.name}
              </span>
            ))}
          </div>

          <p className={styles.excerptLabel}>Excerpt</p>
          <p className={styles.excerpt}>{m.snippet || "No preview text."}</p>
          <p className={styles.note}>
            {demo
              ? "A sample message — the demo has no full emails to open."
              : "Gmail’s short excerpt. Opening this preview doesn’t mark the email as read."}
          </p>
        </>
      ) : null}
    </Sheet>
  );
}

// --- History -------------------------------------------------------------------------

const ICONS = { mark_read: MailOpen, label: Tag, archive: Archive, trash: Trash2 } as const;

/** What Clear out has done, newest first. Counts only — never which emails. */
export function HistorySheet({
  open,
  runs,
  error,
  demo,
  onClose,
}: {
  open: boolean;
  runs: ClearOutRunDto[] | null;
  error: string | null;
  demo: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="side"
      title="History"
      description={
        demo
          ? "What you’ve done in Clear out during this demo. Kept in your browser only."
          : "What you’ve done in Clear out. Only the action and counts are kept — not which emails."
      }
    >
      {error ? (
        <p className={styles.empty}>{error}</p>
      ) : runs === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : runs.length === 0 ? (
        <p className={styles.empty}>Nothing yet. Actions you take in Clear out will appear here.</p>
      ) : (
        <ul className={styles.history}>
          {runs.map((run) => {
            const Icon = ICONS[run.action];
            const unfinished = run.requested - run.succeeded - run.failed;
            return (
              <li key={run.id} className={styles.historyItem}>
                <span className={styles.historyIcon} aria-hidden="true">
                  <Icon size={17} strokeWidth={1.8} />
                </span>
                <div>
                  <p className={styles.historyTitle}>
                    {historyTitle(run.action, run.labelName)} · {emails(run.succeeded)}
                  </p>
                  <p className={styles.historyMeta}>
                    <time dateTime={run.createdAt}>{whenLabel(run.createdAt)}</time>
                    {run.succeeded < run.requested ? ` · ${run.succeeded.toLocaleString("en")} of ${run.requested.toLocaleString("en")} selected` : ""}
                  </p>
                  {run.failed > 0 ? (
                    <p className={styles.historyWarn}>{emails(run.failed)} couldn’t be changed</p>
                  ) : null}
                  {unfinished > 0 ? (
                    <p className={styles.historyMeta}>{emails(unfinished)} not done — stopped before they were sent</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

// --- Permission ------------------------------------------------------------------------

/**
 * Asking for the organise permission, before Google's screen, in plain words:
 * what it allows, what it does not, and that nothing already granted is lost.
 */
export function AccessSheet({
  open,
  grantUrl,
  email,
  onClose,
}: {
  open: boolean;
  grantUrl: string | null;
  email: string | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Allow Tidely to organise your mail"
      description={`Searching and previewing work with the access you’ve already given. To archive, move to Trash, label or mark emails as read, Google needs to approve one more permission${open && email ? ` for ${email}` : ""}.`}
      footer={
        <>
          <button type="button" className={`${buttons.secondary} ${buttons.small}`} onClick={onClose}>
            Not now
          </button>
          {grantUrl ? (
            <a className={`${buttons.primary} ${buttons.small} ${styles.gmail}`} href={grantUrl}>
              Continue to Google
              <ArrowUpRight size={16} strokeWidth={2} aria-hidden />
            </a>
          ) : null}
        </>
      }
    >
      <ul className={styles.points}>
        <li>
          <CircleCheck size={17} strokeWidth={2} aria-hidden />
          <span>
            <strong>Only what you choose.</strong> Tidely changes only the emails you select and confirm, and only
            when you ask.
          </span>
        </li>
        <li>
          <Undo2 size={17} strokeWidth={2} aria-hidden />
          <span>
            <strong>Nothing is deleted for good.</strong> This permission (Gmail’s “modify”) can’t permanently delete
            mail. Trash keeps emails for 30 days.
          </span>
        </li>
        <li>
          <ShieldCheck size={17} strokeWidth={2} aria-hidden />
          <span>
            <strong>Nothing you’ve already allowed changes.</strong> Cleanup and unsubscribing keep working as before.
            You can remove access anytime in Settings or your Google account.
          </span>
        </li>
      </ul>
    </Sheet>
  );
}
