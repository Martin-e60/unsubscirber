"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Layers, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { useMailboxes } from "@/components/layout/MailboxContext";
import { MailboxesSection } from "@/components/views/MailboxesSection";
import { useApi } from "@/lib/api/context";
import type { SendersResponse } from "@/lib/api/types";
import { SECONDS_SAVED_PER_EMAIL, SENDER_STATUS } from "@/lib/constants";
import { mailboxTitle } from "@/lib/mailbox/shared";
import styles from "./SettingsView.module.css";

/**
 * The connected mailboxes, what the app can actually see, and how to remove
 * things.
 *
 * Disconnecting one mailbox and deleting the Tidely account are separate
 * because they are different things, and each says exactly what it leaves
 * behind. The previous single button promised to delete "everything we
 * stored about you" while leaving the account record in place; a promise the
 * app does not keep is worse than a smaller promise.
 */

export function SettingsView({ userEmail }: { userEmail: string }) {
  const api = useApi();
  const { active, mailboxes } = useMailboxes();
  const canOrganise = active?.canOrganise ?? false;
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only shown if this mailbox actually has senders marked from the days
  // when Rollups was in the interface, so nobody new meets a dead end.
  const [rolledUpCount, setRolledUpCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    let live = true;
    api
      .get<SendersResponse>(`/api/senders?status=${SENDER_STATUS.ROLLED_UP}&limit=1`)
      .then((data) => {
        if (live) setRolledUpCount(data.counts[SENDER_STATUS.ROLLED_UP] ?? 0);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, active]);

  async function deleteAccount() {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/account?scope=user", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete the account. Nothing was removed.");
      window.location.href = "/";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setWorking(false);
    }
  }

  return (
    <div className={styles.page}>
      <MailboxesSection />

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.icon}>
            <Eye size={18} strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h2 className={styles.cardTitle}>What Tidely reads, and when</h2>
            <p className={styles.cardSubtitle}>
              Each thing Tidely does with your mailbox, and when. This is all
              of them.
            </p>
          </div>
        </div>

        <ul className={styles.scopes}>
          <li>
            <strong>A scan reads message headers.</strong> Sender, subject, date,
            and the unsubscribe details a sender puts in its headers. It does not
            open the message.
          </li>
          <li>
            <strong>An unsubscribe may read one message.</strong> Only when that
            sender published no unsubscribe header at all — then the link has to
            be found inside its most recent message, so that one message is
            fetched and searched for a link.
          </li>
          <li>
            <strong>An unsubscribe may send one email from your address.</strong>{" "}
            Only for senders whose only unsubscribe route is an email address.
            The message says nothing but &ldquo;please unsubscribe this
            address&rdquo;.
          </li>
          <li>
            <strong>Clear out searches your mail while you use it.</strong>{" "}
            It shows each message&rsquo;s sender, subject, date, labels and
            Gmail&rsquo;s short excerpt — fetched for the page, not stored, and
            never the full body or attachments.
          </li>
          <li>
            <strong>Organising changes only what you select.</strong>{" "}
            {active && mailboxes.length > 1 ? <>{mailboxTitle(active)} — </> : null}
            {canOrganise ? (
              <>
                You&rsquo;ve allowed Tidely to archive, move to Trash, label and
                mark as read the emails you select and confirm. It can&rsquo;t
                delete anything permanently.
              </>
            ) : (
              <>
                Not allowed yet: Tidely can&rsquo;t archive, label or move your
                mail. Clear out asks for this separately when you first try.
              </>
            )}
          </li>
          <li>
            <strong>Stored:</strong> your email address, the connected Google
            account, one summary row per sender, your decisions, a log of every
            unsubscribe attempt, and counts of what you did in Clear out.
            Message bodies are never stored.
          </li>
        </ul>

        <p className={styles.footnote}>
          On Home, &ldquo;Confirmed unsubscribes&rdquo; counts only removals the
          sender confirmed. &ldquo;Fewer emails&rdquo; and &ldquo;Time saved&rdquo;
          per month are estimates: how often those senders wrote before, at{" "}
          {SECONDS_SAVED_PER_EMAIL} seconds per email.{" "}
          <Link href="/privacy">Full privacy policy</Link>.
        </p>
      </section>

      {rolledUpCount > 0 ? (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.icon}>
              <Layers size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <h2 className={styles.cardTitle}>Rollups (retired)</h2>
              <p className={styles.cardSubtitle}>
                {rolledUpCount} {rolledUpCount === 1 ? "sender is" : "senders are"}{" "}
                still marked for a digest that was never built. Marking them
                changed nothing about how their mail arrives.
              </p>
            </div>
            <Link className={styles.link} href="/rollups">
              Review them
            </Link>
          </div>
        </section>
      ) : null}

      {error ? <Notice tone="warning">{error}</Notice> : null}

      <section className={`${styles.card} ${styles.danger}`} id="delete-account">
        <div className={styles.cardHeader}>
          <span className={`${styles.icon} ${styles.dangerIcon}`}>
            <Trash2 size={18} strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h2 className={styles.cardTitle}>Delete Tidely account</h2>
            <p className={styles.cardSubtitle}>
              Not the same as disconnecting a mailbox. This disconnects every
              mailbox above and deletes all of their data, plus the account record
              itself — {userEmail}, your name, and the link to your Google sign-in.
              You are signed out and nothing of yours is left in the database. This
              cannot be undone.
            </p>
          </div>
        </div>

        <div className={styles.dangerActions}>
          {confirming ? (
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="danger" loading={working} onClick={() => void deleteAccount()}>
                Yes, delete my Tidely account
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Delete account
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
