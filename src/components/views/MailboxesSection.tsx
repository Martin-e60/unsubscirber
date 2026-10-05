"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleAlert, Mail, Mails, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useApp } from "@/components/layout/AppShell";
import { useMailboxes } from "@/components/layout/MailboxContext";
import type { MailboxDto } from "@/lib/api/types";
import {
  MAILBOX_LABEL_MAX,
  addMailboxHref,
  mailboxTitle,
  normaliseMailboxLabel,
  reconnectHref,
} from "@/lib/mailbox/shared";
import styles from "./SettingsView.module.css";

/**
 * Settings → Mailboxes: every connected Gmail, with a name the person can
 * set, its state, and adding, reconnecting and removing.
 *
 * Removing a mailbox is deliberately a different thing from deleting the
 * Tidely account (further down the page): it removes that mailbox and its
 * data only, and says so.
 */
export function MailboxesSection() {
  const { mailboxes, active, switchTo } = useMailboxes();

  return (
    <section className={styles.card} id="mailboxes" aria-labelledby="mailboxes-title">
      <div className={styles.cardHeader}>
        <span className={styles.icon}>
          <Mails size={18} strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <h2 className={styles.cardTitle} id="mailboxes-title">
            Mailboxes
          </h2>
          <p className={styles.cardSubtitle}>
            Each Gmail is connected separately and kept apart: scans, decisions,
            history and Clear out only ever apply to the mailbox they were started
            in. Your Tidely sign-in doesn’t change when you add one.
          </p>
        </div>
        <Link className={styles.link} href={addMailboxHref("/settings")}>
          <Plus size={16} strokeWidth={2} aria-hidden /> Add Gmail account
        </Link>
      </div>

      {mailboxes.length === 0 ? (
        <div className={styles.emptyMailboxes}>
          <p>No Gmail mailbox is connected. Your Tidely account is still here.</p>
          <Link className={styles.primaryLink} href="/connect">
            Connect Gmail
          </Link>
        </div>
      ) : (
        <ul className={styles.mailboxList}>
          {mailboxes.map((mailbox) => (
            <MailboxRow
              key={mailbox.id}
              mailbox={mailbox}
              current={mailbox.id === active?.id}
              onShow={() => switchTo(mailbox.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function MailboxRow({
  mailbox,
  current,
  onShow,
}: {
  mailbox: MailboxDto;
  current: boolean;
  onShow: () => void;
}) {
  const { rename, remove } = useMailboxes();
  const { stats } = useApp();
  const [mode, setMode] = useState<"idle" | "rename" | "remove">("idle");
  const [draft, setDraft] = useState(mailbox.label ?? "");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  const title = mailboxTitle(mailbox);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const checked = normaliseMailboxLabel(draft);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await rename(mailbox.id, checked.label);
      setMode("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t save the name.");
    } finally {
      setWorking(false);
    }
  }

  async function disconnect() {
    setWorking(true);
    setError(null);
    try {
      await remove(mailbox.id);
      // This row unmounts with the mailbox; nothing more to do here.
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `${cause.message} Nothing was removed.`
          : "Couldn’t disconnect the mailbox. Nothing was removed.",
      );
      setWorking(false);
    }
  }

  return (
    <li className={styles.mailbox} data-current={current || undefined}>
      <div className={styles.mailboxHead}>
        <span className={styles.mailboxIcon} aria-hidden="true">
          <Mail size={18} strokeWidth={1.75} />
        </span>
        <div className={styles.mailboxWho}>
          <p className={styles.mailboxTitle}>
            {title}
            {current ? <span className={styles.currentTag}>Showing now</span> : null}
          </p>
          {mailbox.label ? <p className={styles.mailboxEmail}>{mailbox.email}</p> : null}
          <p className={styles.mailboxMeta}>
            Gmail · connected {new Date(mailbox.connectedAt).toLocaleDateString()} ·{" "}
            {mailbox.canOrganise ? "Clear out can organise" : "Read and unsubscribe only"}
          </p>
          {mailbox.needsReconnect ? (
            <p className={styles.mailboxWarning}>
              <CircleAlert size={15} strokeWidth={2} aria-hidden />
              Google stopped accepting Tidely’s access. Reconnect to scan or act on this mailbox.
            </p>
          ) : null}
        </div>
      </div>

      {current && stats ? (
        <dl className={styles.facts}>
          <div>
            <dt>Senders found</dt>
            <dd>{stats.totalSenders.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Still undecided</dt>
            <dd>{stats.activeSenders.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Emails handled</dt>
            <dd>{stats.emailsHandled.toLocaleString()}</dd>
          </div>
        </dl>
      ) : null}

      {mode === "rename" ? (
        <form className={styles.renameForm} onSubmit={(event) => void saveName(event)}>
          <label htmlFor={inputId}>Name for {mailbox.email}</label>
          <div className={styles.renameRow}>
            <input
              id={inputId}
              className={styles.input}
              value={draft}
              maxLength={MAILBOX_LABEL_MAX}
              placeholder="e.g. Personal or Work"
              autoComplete="off"
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setMode("idle");
                  setError(null);
                }
              }}
            />
            <Button type="submit" variant="primary" loading={working}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          <p className={styles.hint}>Leave it empty to show just the address.</p>
        </form>
      ) : null}

      {mode === "remove" ? (
        <div className={styles.removeConfirm} role="group" aria-label={`Disconnect ${title}?`}>
          <p>
            Disconnect <strong>{mailbox.email}</strong>? Tidely’s access is revoked
            with Google, and this mailbox’s senders, scans, unsubscribe history and
            Clear out History are deleted from Tidely. Your other mailboxes and your
            Tidely account stay. Lists you already left are not resubscribed.
          </p>
          <div className={styles.dangerActions}>
            <Button variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
            <Button variant="danger" loading={working} onClick={() => void disconnect()}>
              Yes, disconnect this mailbox
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className={styles.rowError} id={errorId} role="alert">
          {error}
        </p>
      ) : null}

      {mode === "idle" ? (
        <div className={styles.mailboxActions}>
          {current ? null : (
            <button type="button" className={styles.textAction} onClick={onShow}>
              Show this mailbox
            </button>
          )}
          <button
            type="button"
            className={styles.textAction}
            onClick={() => {
              setDraft(mailbox.label ?? "");
              setError(null);
              setMode("rename");
            }}
            aria-label={`${mailbox.label ? "Rename" : "Name"} ${mailbox.email}`}
          >
            {mailbox.label ? "Rename" : "Add a name"}
          </button>
          <a
            className={styles.textAction}
            href={reconnectHref(mailbox.id, { next: "/settings" })}
            aria-label={`Reconnect ${mailbox.email}`}
          >
            Reconnect
          </a>
          <button
            type="button"
            className={`${styles.textAction} ${styles.textDanger}`}
            onClick={() => {
              setError(null);
              setMode("remove");
            }}
            aria-label={`Disconnect ${mailbox.email}`}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </li>
  );
}
