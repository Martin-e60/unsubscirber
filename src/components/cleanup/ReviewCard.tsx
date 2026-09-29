"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleCheck, ExternalLink, Mail, X } from "lucide-react";
import { toInitials } from "@/components/ui/Avatar";
import { useApi } from "@/lib/api/context";
import { monthDay, plural } from "@/components/unsubscribed/format";
import type { ArchiveItemDto, UnsubscribedResponse } from "@/lib/api/types";
import styles from "./ReviewCard.module.css";

/**
 * Cleanup's review of one sender you already unsubscribed from, opened by
 * "Review in Cleanup" on the Unsubscribed page.
 *
 * Cleanup's list holds only undecided senders, so a confirmed unsubscribe is
 * shown here on its own instead. Nothing on this card changes the sender:
 * the unsubscribe stays confirmed, and Tidely sends no second request. What
 * it offers are the ways to act by hand.
 */

export function ReviewCard({
  senderId,
  basePath,
  demo,
  onClose,
}: {
  senderId: string;
  basePath: string;
  demo: boolean;
  onClose: () => void;
}) {
  const api = useApi();
  const [item, setItem] = useState<ArchiveItemDto | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    setItem(undefined);
    void api
      .get<UnsubscribedResponse>(`/api/unsubscribed?senderId=${encodeURIComponent(senderId)}&limit=1`)
      .then((data) => {
        if (active) setItem(data.items[0] ?? null);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load this sender");
      });
    return () => {
      active = false;
    };
  }, [api, senderId]);

  // Arriving from a link, focus lands on what the page is now about.
  useEffect(() => {
    if (item !== undefined) headingRef.current?.focus();
  }, [item]);

  const latest = item?.newMessages[0] ?? null;

  return (
    <section className={styles.card} aria-labelledby="review-title" aria-busy={item === undefined && !error}>
      <div className={styles.top}>
        <p className={styles.eyebrow}>Reviewing a sender you unsubscribed from</p>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close review">
          <X size={18} strokeWidth={1.9} aria-hidden />
        </button>
      </div>

      {error ? (
        <>
          <h2 className={styles.title} id="review-title" ref={headingRef} tabIndex={-1}>
            Couldn’t load this sender
          </h2>
          <p className={styles.body}>{error}</p>
        </>
      ) : item === undefined ? (
        <>
          <h2 className="srOnly" id="review-title">
            Loading sender
          </h2>
          <div className={styles.skeleton} aria-hidden="true" />
        </>
      ) : item === null ? (
        <>
          <h2 className={styles.title} id="review-title" ref={headingRef} tabIndex={-1}>
            This sender isn’t in your Unsubscribed archive
          </h2>
          <p className={styles.body}>
            It may have been removed, or the link is out of date. Nothing was changed.
          </p>
        </>
      ) : (
        <>
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">
              {toInitials(item.name ?? item.address)}
            </span>
            <div className={styles.names}>
              <h2 className={styles.title} id="review-title" ref={headingRef} tabIndex={-1}>
                {item.name ?? item.address}
              </h2>
              <p className={styles.address}>{item.address}</p>
            </div>
          </div>

          <ul className={styles.facts}>
            <li>
              <CircleCheck size={17} strokeWidth={1.75} aria-hidden />
              Unsubscribe confirmed · {item.unsubscribedAt ? monthDay(item.unsubscribedAt) : "date not recorded"}
            </li>
            <li>
              <Mail size={17} strokeWidth={1.75} aria-hidden />
              {item.newCount > 0 && latest
                ? `${plural(item.newCount, "email", "emails")} since then, the latest on ${monthDay(latest.receivedAt)}`
                : item.observation === "NO_NEW_MAIL"
                  ? "No new mail found at the last check"
                  : "Not checked since unsubscribing"}
            </li>
          </ul>

          <p className={styles.body}>
            This unsubscribe was confirmed, so Tidely won’t send another request or change it.{" "}
            {item.unsubscribePageUrl || latest?.gmailUrl
              ? "If the emails keep coming, you can still act on them yourself:"
              : "If the emails keep coming, you can still act on them yourself in your mailbox."}
          </p>

          <div className={styles.actions}>
            {item.unsubscribePageUrl ? (
              <a href={item.unsubscribePageUrl} target="_blank" rel="noopener noreferrer" className={styles.action}>
                Open their unsubscribe page
                <ExternalLink size={16} strokeWidth={1.9} aria-hidden />
              </a>
            ) : null}
            {latest?.gmailUrl ? (
              <a href={latest.gmailUrl} target="_blank" rel="noopener noreferrer" className={styles.action}>
                Open the latest email in Gmail
                <ExternalLink size={16} strokeWidth={1.9} aria-hidden />
              </a>
            ) : null}
          </div>
          <p className={styles.hint}>
            {demo
              ? "In the demo these are sample senders, so there is no real page or email to open."
              : "In Gmail, the email’s own unsubscribe link or Report spam also stops it."}
          </p>
        </>
      )}

      <div className={styles.foot}>
        <Link href={`${basePath}/unsubscribed`} className={styles.back}>
          <ArrowLeft size={17} strokeWidth={1.9} aria-hidden />
          Back to Unsubscribed
        </Link>
        <button type="button" className={styles.textButton} onClick={onClose}>
          Close and show the review list
        </button>
      </div>
    </section>
  );
}
