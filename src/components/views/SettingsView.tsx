"use client";

import { useState } from "react";
import { Mail, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { useApp } from "@/components/layout/AppShell";
import { SECONDS_SAVED_PER_EMAIL } from "@/lib/constants";
import styles from "./SettingsView.module.css";

/** Connected mailbox, what the app can see, and how to disconnect. */

export function SettingsView({ connectedAt }: { connectedAt: string }) {
  const { accountEmail, stats } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    setWorking(true);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not disconnect the mailbox.");
      window.location.href = "/";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setWorking(false);
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
              {accountEmail ?? "—"} · connected{" "}
              {new Date(connectedAt).toLocaleDateString()}
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
            <ShieldCheck size={18} strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h2 className={styles.cardTitle}>What Tidely can see</h2>
            <p className={styles.cardSubtitle}>
              Scanning reads message headers — who sent it, when, and how to
              unsubscribe. The contents of your emails are never read.
            </p>
          </div>
        </div>

        <ul className={styles.scopes}>
          <li>Read message headers, to find who is emailing you a list</li>
          <li>Send mail as you, only ever an unsubscribe request you asked for</li>
          <li>Your email address, to know which mailbox is connected</li>
        </ul>

        <p className={styles.footnote}>
          &ldquo;Time saved&rdquo; assumes {SECONDS_SAVED_PER_EMAIL} seconds per
          email you no longer receive.
        </p>
      </section>

      <section className={`${styles.card} ${styles.danger}`}>
        <div className={styles.cardHeader}>
          <span className={`${styles.icon} ${styles.dangerIcon}`}>
            <Trash2 size={18} strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h2 className={styles.cardTitle}>Disconnect mailbox</h2>
            <p className={styles.cardSubtitle}>
              Revokes access with Google and deletes every sender, scan and
              attempt we stored. This cannot be undone.
            </p>
          </div>
        </div>

        {error ? <Notice tone="warning">{error}</Notice> : null}

        <div className={styles.dangerActions}>
          {confirming ? (
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="danger" loading={working} onClick={() => void disconnect()}>
                Yes, delete everything
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Disconnect
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
