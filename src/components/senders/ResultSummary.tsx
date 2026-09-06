"use client";

import { Button } from "@/components/ui/Button";
import styles from "./ResultSummary.module.css";

/** The "here's what happened" bar shown after a batch of unsubscribes. */

export function ResultSummary({
  unsubscribed,
  requested,
  manual,
  failed,
  onDismiss,
}: {
  unsubscribed: number;
  requested: number;
  manual: number;
  failed: number;
  onDismiss: () => void;
}) {
  if (unsubscribed + requested + manual + failed === 0) return null;

  return (
    <div className={styles.summary} role="status">
      <div className={styles.parts}>
        {unsubscribed > 0 ? (
          <span className={styles.success}>
            {unsubscribed} unsubscribed
          </span>
        ) : null}
        {manual > 0 ? (
          <span className={styles.warning}>
            {manual} need one more click
          </span>
        ) : null}
        {failed > 0 ? <span className={styles.danger}>{failed} failed</span> : null}
        {requested > 0 ? (
          <span className={styles.warning}>
            {requested} {requested === 1 ? "request" : "requests"} sent — removal not confirmed
          </span>
        ) : null}
      </div>

      <Button variant="ghost" size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
