"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, RotateCcw, ScanLine } from "lucide-react";
import styles from "./HeroPreview.module.css";

/**
 * The product panel beside the hero heading.
 *
 * A deliberately small preview, not a second demo: four invented emails, the
 * two decisions Tidely is about, and one thing to press. The full, working
 * interface lives at /demo and the panel points there.
 *
 * Nothing here touches the network, storage or any real mailbox. The state is
 * a single boolean in this component; Replay puts it back.
 *
 * The richer, animated version of this panel is a separate, later piece of
 * work — see the note at the bottom of this file.
 */

type Row = {
  id: string;
  initial: string;
  sender: string;
  subject: string;
  /** What the preview shows for this row. */
  role: "keep" | "leave" | "sameSender";
};

const ROWS: Row[] = [
  {
    id: "stories",
    initial: "S",
    sender: "Sunday Stories",
    subject: "A little inspiration for Sunday",
    role: "keep",
  },
  {
    id: "deals-1",
    initial: "D",
    sender: "Daily Deals",
    subject: "Your next great deal is here",
    role: "leave",
  },
  {
    id: "deals-2",
    initial: "D",
    sender: "Daily Deals",
    subject: "Last chance. Don’t miss out.",
    role: "sameSender",
  },
  {
    id: "design",
    initial: "N",
    sender: "Notes on Design",
    subject: "Good things take a little space",
    role: "keep",
  },
];

export function HeroPreview() {
  const [left, setLeft] = useState(false);
  // Bumped by Replay so the rows play their short entrance again.
  const [run, setRun] = useState(0);

  return (
    <section className={styles.panel} aria-labelledby="preview-title">
      <header className={styles.header}>
        <h2 className={styles.title} id="preview-title">
          Your inbox, simplified.
        </h2>
        <button
          type="button"
          className={styles.replay}
          onClick={() => {
            setLeft(false);
            setRun((n) => n + 1);
          }}
        >
          Replay
          <RotateCcw size={13} strokeWidth={2} aria-hidden />
        </button>
      </header>

      <div className={styles.body}>
        <div className={styles.meta}>
          <span>4 sample emails</span>
          <span className={styles.chip}>Interactive preview</span>
        </div>

        <ul className={styles.list} key={run}>
          {ROWS.map((row, index) => {
            const isDeals = row.role !== "keep";
            const gone = isDeals && left;

            return (
              <li
                key={row.id}
                className={styles.row}
                data-gone={gone || undefined}
                style={{ "--i": index } as React.CSSProperties}
              >
                <span className={styles.initial} aria-hidden="true">
                  {row.initial}
                </span>

                <span className={styles.text}>
                  <span className={styles.sender}>{row.sender}</span>
                  <span className={styles.subject}>{row.subject}</span>
                </span>

                <span className={styles.action}>
                  {row.role === "keep" ? (
                    <span className={styles.kept}>
                      Keep <Check size={15} strokeWidth={2.25} aria-hidden />
                    </span>
                  ) : row.role === "leave" ? (
                    left ? (
                      <span className={styles.done}>
                        Unsubscribed{" "}
                        <Check size={15} strokeWidth={2.25} aria-hidden />
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.unsubscribe}
                        onClick={() => setLeft(true)}
                        aria-describedby="preview-note"
                      >
                        Unsubscribe
                      </button>
                    )
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="srOnly" role="status">
          {left ? "Daily Deals unsubscribed in the sample. Both of its emails are gone." : ""}
        </p>
        <p className="srOnly" id="preview-note">
          Sample data only. Nothing is sent.
        </p>

        <Link href="/demo" className={styles.cta}>
          <ScanLine size={18} strokeWidth={1.75} aria-hidden />
          Try the demo to find your subscriptions.
        </Link>
      </div>
    </section>
  );
}

/*
 * Later stage, deliberately not built here:
 *   - a scan that fills the list in front of the visitor
 *   - several senders with the four real outcomes, not just one
 *   - motion choreographed across the whole panel
 * This version exists to complete the hero composition, not to replace /demo.
 */
