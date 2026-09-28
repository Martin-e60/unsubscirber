"use client";

import { useId, useState } from "react";
import Link from "next/link";
import styles from "./Accordion.module.css";

/**
 * "What does Tidely access?" — answered from what the code actually does.
 *
 *   scan         → message headers only (src/lib/scan/engine.ts)
 *   body link    → one message, only when a sender has no unsubscribe header
 *                  and only because you asked (planMethods, BODY_LINK)
 *   mailto       → one email from your address (sendMailto)
 *   disconnect   → revokes Google access and deletes the scan data
 *                  (DELETE /api/account)
 *
 * If any of those behaviours change, this text has to change with them.
 */
export function AccessDetails() {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={styles.disclosure} data-open={open || undefined}>
      <button
        type="button"
        id={`${id}-b`}
        className={styles.disclosureTrigger}
        aria-expanded={open}
        aria-controls={`${id}-r`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.caret} aria-hidden="true" />
        What does Tidely access?
      </button>

      <div
        id={`${id}-r`}
        role="region"
        aria-labelledby={`${id}-b`}
        className={styles.region}
        inert={!open}
      >
        <div className={styles.clip}>
          <ul className={styles.facts}>
            <li>
              <strong>When you scan,</strong> Tidely reads message headers — the
              sender, subject, date and the unsubscribe details a sender includes.
              It doesn’t open your messages.
            </li>
            <li>
              <strong>When you unsubscribe</strong> from a sender that gives no
              unsubscribe details in its headers, Tidely reads that sender’s most
              recent message to find the link. Only that one message, and only
              because you asked.
            </li>
            <li>
              <strong>Some senders only accept an email.</strong> For those,
              Tidely sends one short unsubscribe request from your address.
            </li>
            <li>
              <strong>You can disconnect Gmail at any time</strong> in Settings,
              which also deletes the scan data Tidely stored.
            </li>
          </ul>
          <p className={styles.more}>
            <Link href="/privacy">Read the privacy policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
