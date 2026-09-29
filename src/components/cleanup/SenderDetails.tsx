"use client";

import { forwardRef, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, Heart, Info, Mail } from "lucide-react";
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
    onBack: () => void;
    onKeep: () => void;
    onUnsubscribe: () => void;
  }
>(function SenderDetails(
  { sender, loading, busy, locked, demo, sheet, open, position, notice, onBack, onKeep, onUnsubscribe },
  backRef,
) {
  const label = sender ? sender.name ?? sender.address : "";
  const since = sender ? monthYear(sender.firstSeenAt) : null;
  const canUnsubscribe = Boolean(sender?.canUnsubscribe);

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
            <div className={styles.content} key={sender.id}>
              <header className={styles.identity}>
                <span className={styles.avatar} aria-hidden="true">
                  {toInitials(label)}
                </span>
                <div className={styles.names}>
                  <h2 className={styles.name} id="sender-details-title">
                    {label}
                  </h2>
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

              <div className={styles.recent}>
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
            </div>

            <div className={styles.decide}>
              <h3 className={styles.question}>Still want to hear from them?</h3>
              <p className={styles.muted}>Your choice applies to this sender.</p>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={buttons.secondary}
                  disabled={locked || busy}
                  onClick={onKeep}
                >
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
                  {busy ? "Sending…" : "Unsubscribe"}
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
                    This sender publishes no unsubscribe method Tidely can use. You can keep
                    them, or use the unsubscribe link in one of their emails.
                  </span>
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
});
