"use client";

import { forwardRef, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  Clock,
  ExternalLink,
  Heart,
  Info,
  Mail,
  MousePointerClick,
} from "lucide-react";
import { toInitials } from "@/components/ui/Avatar";
import { SENDER_STATUS } from "@/lib/constants";
import type { SenderDto } from "@/lib/api/types";
import { monthYear, receivedLabel } from "./format";
import buttons from "./buttons.module.css";
import styles from "./SenderDetails.module.css";

/**
 * Everything Tidely knows about one sender, and the two decisions.
 *
 * Only data the app actually has is shown. A scan keeps the subject of the
 * newest message from each sender and nothing more, so there is one "latest
 * email" rather than an invented list, and no message bodies are fetched to
 * fill the panel.
 *
 * The buttons sit outside the part that changes per sender, so after a
 * decision the keyboard focus stays on them while the next sender slides in.
 */

export const SenderDetails = forwardRef<
  HTMLButtonElement,
  {
    sender: SenderDto | null;
    loading: boolean;
    busy: boolean;
    locked: boolean;
    demo: boolean;
    /** Phones and narrow windows: shown as its own screen with a way back. */
    sheet: boolean;
    open: boolean;
    position: { index: number; total: number } | null;
    notice?: ReactNode;
    /** Which Cleanup view this panel belongs to. */
    mode: "review" | "keeping";
    basePath: string;
    /** A move back to review is being saved. */
    moving: boolean;
    onBack: () => void;
    onKeep: () => void;
    onUnsubscribe: () => void;
    onMoveToReview: () => void;
  }
>(function SenderDetails(
  {
    sender,
    loading,
    busy,
    locked,
    demo,
    sheet,
    open,
    position,
    notice,
    mode,
    basePath,
    moving,
    onBack,
    onKeep,
    onUnsubscribe,
    onMoveToReview,
  },
  backRef,
) {
  const label = sender ? sender.name ?? sender.address : "";
  const since = sender ? monthYear(sender.firstSeenAt) : null;

  return (
    <section
      className={styles.details}
      data-sheet={sheet || undefined}
      data-open={open || undefined}
      aria-labelledby="sender-details-title"
      {...(sheet ? { role: "dialog", "aria-modal": true } : {})}
    >
      {sheet ? (
        <div className={styles.sheetBar}>
          <button type="button" className={styles.back} onClick={onBack} ref={backRef}>
            <ArrowLeft size={18} strokeWidth={1.9} aria-hidden />
            Back to list
          </button>
          {position ? (
            <span className={styles.position}>
              {position.index + 1} of {position.total}
            </span>
          ) : null}
        </div>
      ) : null}

      {sheet && notice ? <div className={styles.sheetNotice}>{notice}</div> : null}

      <div className={styles.card}>
        {/* Part of the card, so it can never drift away from it. */}
        <p className={styles.cardLabel} aria-hidden="true">
          Sender details
        </p>
        {sender === null ? (
          loading ? (
            <div className={styles.skeleton} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <div className={styles.none}>
              <h2 className={styles.noneTitle} id="sender-details-title">
                No sender open
              </h2>
              <p>Open a sender from the list to see their details here.</p>
            </div>
          )
        ) : (
          <>
            <div className={styles.content} key={`${sender.id}-summary`}>
              <header className={styles.identity}>
                <span className={styles.avatar} aria-hidden="true">
                  {toInitials(label)}
                </span>
                <div className={styles.names}>
                  <div className={styles.nameRow}>
                    <h2 className={styles.name} id="sender-details-title">
                      {label}
                    </h2>
                    {mode === "keeping" ? (
                      <span className={styles.badge}>
                        <Heart size={15} strokeWidth={2} aria-hidden />
                        Keeping
                      </span>
                    ) : null}
                  </div>
                  <p className={styles.address}>{sender.address}</p>
                </div>
              </header>

              <dl className={styles.stats}>
                <div className={styles.stat}>
                  <dt className="srOnly">How often</dt>
                  <dd className={styles.statValue}>
                    <span className={styles.big}>{sender.perMonth.toLocaleString("en")}</span>
                    <span className={styles.unit}>{sender.perMonth === 1 ? "email" : "emails"} / month</span>
                  </dd>
                  <dd className={styles.statNote}>
                    {since ? `Average since ${since}` : "Average over the mail scanned"}
                    {" · "}
                    {sender.messageCount.toLocaleString("en")} seen
                  </dd>
                </div>
                <div className={styles.stat}>
                  <dt className="srOnly">Last received</dt>
                  <dd className={styles.statValue}>
                    <span className={styles.when}>{receivedLabel(sender.lastSeenAt)}</span>
                  </dd>
                  <dd className={styles.statNote}>Last received</dd>
                </div>
              </dl>
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

            {/* What arrived, after the decision it informs. */}
            <div className={`${styles.content} ${styles.recent}`} key={`${sender.id}-recent`}>
              <h3 className={styles.eyebrow}>Latest email</h3>
              {sender.sampleSubject ? (
                <p className={styles.email}>
                  <Mail size={17} strokeWidth={1.75} aria-hidden />
                  <span>
                    <span className={styles.subject}>{sender.sampleSubject}</span>
                    <span className={styles.emailDate}>{receivedLabel(sender.lastSeenAt)}</span>
                  </span>
                </p>
              ) : (
                <p className={styles.muted}>No subject line was recorded for this sender.</p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
});

/**
 * The middle of the panel, right after who and how often: what can be
 * decided about this sender, and nothing
 * that cannot.
 *
 *   Keeping          move back to review — a status change only
 *   Request sent     nothing: a request went out and cannot be taken back
 *   Needs a click    finish on their page, keep, or try again
 *   Failed           keep, or try again
 *   Waiting          keep, or unsubscribe
 */
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
  if (mode === "keeping") {
    return (
      <div className={styles.decide}>
        <h3 className={styles.question}>Changed your mind?</h3>
        <p className={styles.muted}>Move this sender back to your review list.</p>
        <div className={styles.single}>
          <button
            type="button"
            className={buttons.outline}
            disabled={locked || moving}
            data-loading={moving || undefined}
            aria-describedby="move-note"
            onClick={onMoveToReview}
          >
            {moving ? "Moving…" : "Move to review"}
            {moving ? (
              <span className={buttons.spinner} aria-hidden="true" />
            ) : (
              <ArrowRight size={18} strokeWidth={2} aria-hidden />
            )}
          </button>
        </div>
        <p className={styles.note} id="move-note">
          <Info size={15} strokeWidth={1.75} aria-hidden />
          <span>This won’t unsubscribe you.</span>
        </p>
      </div>
    );
  }

  const history = (
    <a href={`${basePath}/history`} className={styles.inlineLink}>
      See every attempt
    </a>
  );

  if (sender.status === SENDER_STATUS.REQUESTED) {
    return (
      <div className={styles.decide}>
        <div className={styles.followUp}>
          <Clock size={18} strokeWidth={1.75} aria-hidden />
          <div>
            <p className={styles.followTitle}>Request sent — removal not confirmed</p>
            <p className={styles.muted}>
              Tidely emailed this sender’s unsubscribe address. Emails may still arrive, and no
              second request will be sent. {history}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const followUp =
    sender.status === SENDER_STATUS.MANUAL ? (
      <div className={styles.followUp}>
        <MousePointerClick size={18} strokeWidth={1.75} aria-hidden />
        <div>
          <p className={styles.followTitle}>Needs one more click</p>
          <p className={styles.muted}>
            Their unsubscribe page asks you to confirm.{" "}
            {sender.manualUrl ? (
              <a href={sender.manualUrl} target="_blank" rel="noreferrer noopener" className={styles.inlineLink}>
                Finish on their page
                <ExternalLink size={13} strokeWidth={2} aria-hidden />
              </a>
            ) : (
              history
            )}
          </p>
        </div>
      </div>
    ) : sender.status === SENDER_STATUS.FAILED ? (
      <div className={styles.followUp} data-tone="danger">
        <CircleAlert size={18} strokeWidth={1.75} aria-hidden />
        <div>
          <p className={styles.followTitle}>The last unsubscribe attempt failed</p>
          <p className={styles.muted}>You can keep this sender or try again. {history}</p>
        </div>
      </div>
    ) : null;

  const retry = sender.status === SENDER_STATUS.MANUAL || sender.status === SENDER_STATUS.FAILED;
  const canUnsubscribe = sender.canUnsubscribe;

  return (
    <div className={styles.decide}>
      {followUp}
      <h3 className={styles.question}>Still want to hear from them?</h3>
      <p className={styles.muted}>Your choice applies to this sender.</p>

      <div className={styles.actions}>
        <button type="button" className={buttons.secondary} disabled={locked || busy} onClick={onKeep}>
          Keep
          <Heart size={18} strokeWidth={1.75} aria-hidden />
        </button>
        <button
          type="button"
          className={buttons.primary}
          disabled={locked || busy || !canUnsubscribe}
          data-loading={busy || undefined}
          aria-describedby={canUnsubscribe ? "unsubscribe-note" : "no-method-note"}
          onClick={onUnsubscribe}
        >
          {busy ? "Sending…" : retry ? "Try again" : "Unsubscribe"}
          {busy ? (
            <span className={buttons.spinner} aria-hidden="true" />
          ) : (
            <ArrowUpRight size={18} strokeWidth={2} aria-hidden />
          )}
        </button>
      </div>

      {canUnsubscribe || sender.status === SENDER_STATUS.UNSUBSCRIBING ? (
        <p className={styles.note} id="unsubscribe-note">
          <Info size={15} strokeWidth={1.75} aria-hidden />
          <span>
            We’ll show the outcome of your request.
            <br />
            Sending a request is not confirmation.
            {demo ? " In the demo nothing is sent." : null}
          </span>
        </p>
      ) : (
        <p className={styles.note} id="no-method-note">
          <Info size={15} strokeWidth={1.75} aria-hidden />
          <span>
            This sender publishes no unsubscribe method Tidely can use. You can keep them, or use
            the unsubscribe link in one of their emails.
          </span>
        </p>
      )}
    </div>
  );
}
