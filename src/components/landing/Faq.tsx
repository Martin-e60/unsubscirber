"use client";

import { useEffect, useId, useRef, useState } from "react";
import { scrubReveal, type ScrubTarget } from "./scrub";
import styles from "./Faq.module.css";

/**
 * The landing page's FAQ: five rows, each opened and closed on its own.
 *
 * The answers are written from what the code actually does — if any of these
 * behaviours change, the text has to change with them:
 *
 *   scan         → message headers only (src/lib/scan/engine.ts)
 *   body link    → one message, only when a sender has no unsubscribe header
 *                  and only because you asked (planMethods, BODY_LINK)
 *   mailto       → one email from your address (sendMailto)
 *   outcomes     → src/lib/unsubscribe/engine.ts: confirmed, request sent,
 *                  one more click, failed
 *   clear out    → mark read, label, archive, Trash, only with the separately
 *                  granted gmail.modify scope; nothing is deleted for good
 *                  (src/lib/clearout, GMAIL_MODIFY_SCOPE)
 *   disconnect   → Settings → Disconnect revokes Google access and deletes the
 *                  mailbox's scan data (DELETE /api/mailboxes/<id>)
 */
const QUESTIONS = [
  {
    question: "Is Tidely free?",
    answer: "Yes. Tidely is a free personal project with no paid plan.",
  },
  {
    question: "What does Tidely access in my Gmail?",
    answer:
      "When scanning, Tidely reads message headers such as sender, subject, date and unsubscribe details. If a selected sender provides no usable unsubscribe details in its headers, Tidely may read that sender’s most recent message to find a link. Some senders require an unsubscribe email sent from your address. Clear out asks for an additional permission before organizing emails.",
  },
  {
    question: "Does unsubscribing always work?",
    answer:
      "No. Tidely distinguishes confirmed removal, an email request sent, a step that needs another click, and a failed attempt. A sent request is not confirmation that you were removed.",
  },
  {
    question: "What can I do with Clear out?",
    answer:
      "Select emails to mark as read, label, archive or move to Trash. Tidely asks for the extra Google permission needed for these actions. It cannot permanently delete your emails.",
  },
  {
    question: "Can I disconnect Gmail at any time?",
    answer:
      "Yes. You can disconnect Gmail in Settings, which also deletes the scan data Tidely stored.",
  },
];

export function Faq() {
  const section = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);

  // The heading follows the section's top edge, each row its own. A row is
  // measured by its <li> and lifted by the card inside it, so lifting a row
  // never moves the line it is measured against.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!section.current || !heading.current || !list.current) return;

    const targets: ScrubTarget[] = [
      { trigger: section.current, node: heading.current, rise: 60, start: 0.75, end: 0.5 },
    ];
    for (const item of list.current.children) {
      const card = item.firstElementChild;
      if (card instanceof HTMLElement) {
        targets.push({ trigger: item, node: card, rise: 40, start: 0.9, end: 0.7 });
      }
    }
    return scrubReveal(targets);
  }, []);

  return (
    <section ref={section} id="faq" className={styles.faq} aria-labelledby="faq-title">
      <h2 ref={heading} id="faq-title" className={styles.title}>
        <span>Frequently Asked</span>
        <span>Questions</span>
      </h2>

      <ul ref={list} className={styles.list}>
        {QUESTIONS.map(({ question, answer }) => (
          <li key={question}>
            <FaqItem question={question} answer={answer} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One row. It owns its open state, so rows never close each other. */
function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={styles.item} data-open={open || undefined}>
      <h3 className={styles.heading}>
        <button
          type="button"
          id={`${id}-b`}
          className={styles.trigger}
          aria-expanded={open}
          aria-controls={`${id}-r`}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={styles.question}>{question}</span>
          {/* A plus that turns 45° into a ×. */}
          <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 1v18M1 10h18" />
          </svg>
        </button>
      </h3>

      <div
        id={`${id}-r`}
        role="region"
        aria-labelledby={`${id}-b`}
        className={styles.panel}
        inert={!open}
      >
        <div className={styles.clip}>
          <p className={styles.answer}>{answer}</p>
        </div>
      </div>
    </div>
  );
}
