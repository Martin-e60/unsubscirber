"use client";

import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  Clock,
  ExternalLink,
  Heart,
  Info,
  Mails,
  MousePointerClick,
} from "lucide-react";
import { toInitials } from "@/components/ui/Avatar";
import { SENDER_STATUS } from "@/lib/constants";
import type { SenderDto } from "@/lib/api/types";
import glass from "@/components/home/glass.module.css";
import styles from "./SenderHeader.module.css";

/**
 * Who the message pane is about, and what can be decided about them.
 *
 * Two different things live in the right-hand pane and they are kept apart:
 * this header is about the sender's *subscription* — Keep, Unsubscribe, or
 * moving a kept sender back to review — and the messages below it are about
 * *organising mail*. Nothing here archives, trashes or labels a message, and
 * nothing below changes a subscription decision.
 *
 *   Waiting          keep, or unsubscribe
 *   Needs a click    finish on their page, keep, or try again
 *   Failed           keep, or try again
 *   Request sent     nothing: a request went out and cannot be taken back
 *   Keeping          move back to review — a status change only
 *   All emails       no subscription at all, so no subscription actions
 *
 * Only data the app actually has is shown: the sender's usual frequency is
 * "emails / month"; how many messages match is the message pane's own count.
 */

export function SenderHeader({
  sender,
  all,
  loading,
  mode,
  busy,
  locked,
  moving,
  demo,
  basePath,
  onKeep,
  onUnsubscribe,
  onMoveToReview,
}: {
  /** Null while loading, or when there is no sender to show. */
  sender: SenderDto | null;
  /** All emails: the whole mailbox rather than one sender. */
  all: boolean;
  /** The sender is still being worked out. */
  loading: boolean;
  mode: "review" | "keeping";
  busy: boolean;
  locked: boolean;
  moving: boolean;
  demo: boolean;
  basePath: string;
  onKeep: () => void;
  onUnsubscribe: () => void;
  onMoveToReview: () => void;
}) {
  if (all) {
    return (
      <header className={styles.header}>
        <span className={`${styles.avatar} ${styles.allIcon}`} aria-hidden="true">
          <Mails size={30} strokeWidth={1.5} />
        </span>
        <div className={styles.identity}>
          <h2 className={styles.name} id="cleanup-subject">
            All emails
          </h2>
          <p className={styles.address}>
            Your personal and subscription emails together. Choose a sender to keep or unsubscribe.
          </p>
        </div>
      </header>
    );
  }

  if (!sender) {
    if (!loading) {
      return (
        <header className={styles.header}>
          <span className={`${styles.avatar} ${styles.allIcon}`} aria-hidden="true">
            <Mails size={30} strokeWidth={1.5} />
          </span>
          <div className={styles.identity}>
            <h2 className={styles.name} id="cleanup-subject">
              No sender selected
            </h2>
            <p className={styles.address}>Choose a sender on the left to see their emails and decide about them.</p>
          </div>
        </header>
      );
    }
    return (
      <header className={styles.header} aria-hidden="true">
        <span className={`${styles.avatar} ${styles.skeleton}`} />
        <div className={styles.identity}>
          <span className={`${styles.skeleton} ${styles.skeletonName}`} />
          <span className={`${styles.skeleton} ${styles.skeletonLine}`} />
        </div>
      </header>
    );
  }

  const label = sender.name ?? sender.address;

  return (
    <header className={styles.header}>
      <span className={styles.avatar} aria-hidden="true">
        {toInitials(label)}
      </span>

      <div className={styles.identity}>
        <h2 className={styles.name} id="cleanup-subject">
          {label}
        </h2>
        <div className={styles.meta}>
          <p className={styles.address}>{sender.address}</p>
          <p className={styles.rate}>
            <span className="srOnly">Usually </span>
            {sender.perMonth.toLocaleString("en")} {sender.perMonth === 1 ? "email" : "emails"} / month
          </p>
        </div>
      </div>

      <Decision
        sender={sender}
        mode={mode}
        busy={busy}
        locked={locked}
        moving={moving}
        demo={demo}
        basePath={basePath}
        onKeep={onKeep}
        onUnsubscribe={onUnsubscribe}
        onMoveToReview={onMoveToReview}
      />
    </header>
  );
}

function Decision({
  sender,
  mode,
  busy,
  locked,
  moving,
  demo,
  basePath,
  onKeep,
  onUnsubscribe,
  onMoveToReview,
}: {
  sender: SenderDto;
  mode: "review" | "keeping";
  busy: boolean;
  locked: boolean;
  moving: boolean;
  demo: boolean;
  basePath: string;
  onKeep: () => void;
  onUnsubscribe: () => void;
  onMoveToReview: () => void;
}) {
  const history = (
    <a href={`${basePath}/history`} className={styles.link}>
      See every attempt
    </a>
  );

  const note = (icon: ReactNode, body: ReactNode, id?: string, tone?: "danger") => (
    <p className={styles.note} id={id} data-tone={tone}>
      {icon}
      <span>{body}</span>
    </p>
  );

  if (mode === "keeping") {
    return (
      <div className={styles.decide}>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.keep} ${glass.button}`}
            disabled={locked || moving}
            data-loading={moving || undefined}
            aria-describedby="move-note"
            onClick={onMoveToReview}
          >
            {moving ? "Moving…" : "Move to review"}
            {moving ? <span className={styles.spinner} aria-hidden="true" /> : <ArrowRight size={19} strokeWidth={1.8} aria-hidden />}
          </button>
        </div>
        {note(<Info size={17} strokeWidth={1.6} aria-hidden />, "This won’t unsubscribe you.", "move-note")}
      </div>
    );
  }

  if (sender.status === SENDER_STATUS.REQUESTED) {
    return (
      <div className={styles.decide}>
        {note(
          <Clock size={17} strokeWidth={1.6} aria-hidden />,
          <>
            <strong>Request sent — removal not confirmed.</strong> Tidely emailed this sender’s unsubscribe address.
            Emails may still arrive, and no second request will be sent. {history}
          </>,
        )}
      </div>
    );
  }

  const retry = sender.status === SENDER_STATUS.MANUAL || sender.status === SENDER_STATUS.FAILED;
  const canUnsubscribe = sender.canUnsubscribe;

  const followUp =
    sender.status === SENDER_STATUS.MANUAL
      ? note(
          <MousePointerClick size={17} strokeWidth={1.6} aria-hidden />,
          <>
            <strong>Needs one more click.</strong> Their unsubscribe page asks you to confirm.{" "}
            {sender.manualUrl ? (
              <a href={sender.manualUrl} target="_blank" rel="noreferrer noopener" className={styles.link}>
                Finish on their page
                <ExternalLink size={13} strokeWidth={2} aria-hidden />
              </a>
            ) : (
              history
            )}
          </>,
        )
      : sender.status === SENDER_STATUS.FAILED
        ? note(
            <CircleAlert size={17} strokeWidth={1.6} aria-hidden />,
            <>
              <strong>The last unsubscribe attempt failed.</strong> You can keep this sender or try again. {history}
            </>,
            undefined,
            "danger",
          )
        : null;

  return (
    <div className={styles.decide}>
      <div className={styles.actions}>
        <button type="button" className={`${styles.keep} ${glass.button}`} disabled={locked || busy} onClick={onKeep}>
          <Heart size={20} strokeWidth={1.6} aria-hidden />
          Keep
        </button>
        <button
          type="button"
          className={styles.unsubscribe}
          disabled={locked || busy || !canUnsubscribe}
          data-loading={busy || undefined}
          aria-describedby={canUnsubscribe ? "unsubscribe-note" : "no-method-note"}
          onClick={onUnsubscribe}
        >
          {busy ? "Sending…" : retry ? "Try again" : "Unsubscribe"}
          {busy ? <span className={styles.spinner} aria-hidden="true" /> : <ArrowUpRight size={19} strokeWidth={1.8} aria-hidden />}
        </button>
      </div>

      {followUp}
      {canUnsubscribe || sender.status === SENDER_STATUS.UNSUBSCRIBING
        ? note(
            <Info size={17} strokeWidth={1.6} aria-hidden />,
            <>
              Sending a request is not confirmation.
              {demo ? " In the demo nothing is sent." : " We’ll show the outcome of your request."}
            </>,
            "unsubscribe-note",
          )
        : note(
            <Info size={17} strokeWidth={1.6} aria-hidden />,
            "This sender publishes no unsubscribe method Tidely can use. You can keep them, or use the unsubscribe link in one of their emails.",
            "no-method-note",
          )}
    </div>
  );
}
