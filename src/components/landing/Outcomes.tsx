"use client";

import { useId, useState } from "react";
import { Check, CircleAlert, MousePointer2, Send, type LucideIcon } from "lucide-react";
import { nextOpen } from "./accordion";
import styles from "./Accordion.module.css";

/**
 * The four things that can happen when you unsubscribe.
 *
 * Mirrors the real engine in src/lib/unsubscribe/engine.ts: a confirmed
 * removal, an email request that is not a confirmation, a page that needs one
 * more click, and a failure. Keeping "request sent" apart from "confirmed" is
 * the whole point, so the wording here must not blur them.
 *
 * One row open at a time; the first starts open.
 */

type Outcome = {
  title: string;
  body: string;
  icon: LucideIcon;
  tone: "ok" | "sent" | "warn" | "bad";
};

const OUTCOMES: Outcome[] = [
  {
    title: "Removal confirmed",
    body: "The sender accepted the unsubscribe action or confirmed you were removed.",
    icon: Check,
    tone: "ok",
  },
  {
    title: "Request sent",
    body: "This sender only accepts an email, so Tidely sent one from your address. It’s a request — removal isn’t confirmed yet.",
    icon: Send,
    tone: "sent",
  },
  {
    title: "One more click",
    body: "The sender’s page asks for a button Tidely can’t press for you. You get the link to finish it yourself.",
    icon: MousePointer2,
    tone: "warn",
  },
  {
    title: "Couldn’t unsubscribe",
    body: "The sender offers no usable way out, or its unsubscribe step failed. Tidely records it rather than hiding it.",
    icon: CircleAlert,
    tone: "bad",
  },
];

export function Outcomes() {
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();

  return (
    <div className={styles.panel}>
      {OUTCOMES.map(({ title, body, icon: Icon, tone }, index) => {
        const isOpen = open === index;
        const buttonId = `${baseId}-b${index}`;
        const regionId = `${baseId}-r${index}`;

        return (
          <div key={title} className={styles.item} data-open={isOpen || undefined}>
            <h3 className={styles.heading}>
              <button
                type="button"
                id={buttonId}
                className={styles.trigger}
                aria-expanded={isOpen}
                aria-controls={regionId}
                onClick={() => setOpen((current) => nextOpen(current, index))}
              >
                <span className={styles.icon} data-tone={tone} aria-hidden="true">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span className={styles.label}>{title}</span>
                <span className={styles.plus} aria-hidden="true" />
              </button>
            </h3>

            <div
              id={regionId}
              role="region"
              aria-labelledby={buttonId}
              className={styles.region}
              inert={!isOpen}
            >
              <div className={styles.clip}>
                <p className={styles.body}>{body}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
