"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Layers, Mail, Trash2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { useApp } from "@/components/layout/AppShell";
import { SECONDS_SAVED_PER_EMAIL } from "@/lib/constants";
import styles from "./SettingsView.module.css";

/**
 * The connected mailbox, what the app can actually see, and how to remove it.
 *
 * The two removals are separate cards because they are different things, and
 * each says exactly what it leaves behind. The previous single button promised
 * to delete "everything we stored about you" while leaving the account record
 * in place; a promise the app does not keep is worse than a smaller promise.
 */

type Removal = "mailbox" | "account";

export function SettingsView({
  connectedAt,
  accountEmail,
  userEmail,
  rolledUpCount,
}: {
  connectedAt: string;
  accountEmail: string;
  userEmail: string;
  rolledUpCount: number;
}) {
  const { stats } = useApp();
  const [confirming, setConfirming] = useState<Removal | null>(null);
  const [working, setWorking] = useState<Removal | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(kind: Removal) {
    setWorking(kind);
    setError(null);
    try {
      const response = await fetch(
        kind === "account" ? "/api/account?scope=user" : "/api/account",
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(
          kind === "account"
            ? "Could not delete the account. Nothing was removed."
            : "Could not disconnect the mailbox. Nothing was removed.",
        );
      }
      // Disconnecting keeps you signed in, so it goes back to the connect step.
      window.location.href = kind === "account" ? "/" : "/connect";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setWorking(null);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.icon}>
            <Mail size={18} strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h2 className={styles.cardTitle}>Connected mailbox</h2>
            <p className={styles.cardSubtitle}>
              {accountEmail} · connected {new Date(connectedAt).toLocaleDateString()}
            </p>
          </div>
          <a className={styles.link} href="/api/auth/google/start">
            Reconnect
          </a>
        </div>

        {stats ? (
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
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.icon}>
            <Eye size={18} strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h2 className={styles.cardTitle}>What Tidely reads, and when</h2>
            <p className={styles.cardSubtitle}>
              Three different things happen at three different moments. This is
              all of them.
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
            <strong>Stored:</strong> your email address, the connected Google
            account, one summary row per sender, your decisions, and a log of
            every unsubscribe attempt. Message bodies are never stored.
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

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.icon}>
            <Unplug size={18} strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h2 className={styles.cardTitle}>Disconnect mailbox</h2>
            <p className={styles.cardSubtitle}>
              Revokes Tidely&rsquo;s access with Google and deletes every sender,
              scan and attempt stored for {accountEmail}. Your Tidely login stays,
              so you can connect a mailbox again later. Emails you already
              unsubscribed from are not resubscribed.
            </p>
          </div>
        </div>

        <div className={styles.dangerActions}>
          {confirming === "mailbox" ? (
            <>
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={working === "mailbox"}
                onClick={() => void remove("mailbox")}
              >
                Yes, disconnect and delete the scan data
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming("mailbox")}>
              Disconnect
            </Button>
          )}
        </div>
      </section>

      <section className={`${styles.card} ${styles.danger}`}>
        <div className={styles.cardHeader}>
          <span className={`${styles.icon} ${styles.dangerIcon}`}>
            <Trash2 size={18} strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h2 className={styles.cardTitle}>Delete account</h2>
            <p className={styles.cardSubtitle}>
              Everything above, plus the account record itself — {userEmail}, your
              name, and the link to your Google account. You are signed out and
              nothing of yours is left in the database. This cannot be undone.
            </p>
          </div>
        </div>

        <div className={styles.dangerActions}>
          {confirming === "account" ? (
            <>
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={working === "account"}
                onClick={() => void remove("account")}
              >
                Yes, delete my account
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming("account")}>
              Delete account
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
