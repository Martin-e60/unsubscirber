"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Select } from "@/components/ui/Select";
import { DEFAULT_LOOKBACK_DAYS, LOOKBACK_OPTIONS } from "@/lib/constants";
import type { ScanProgressDto } from "@/lib/api/types";
import styles from "./ScanPanel.module.css";

/**
 * Starting a scan and watching it run.
 *
 * Purely presentational: it renders whatever progress it is handed and calls
 * back when a button is pressed. The scanning loop itself lives in useScan.
 */

const LOOKBACK_LABEL: Record<number, string> = {
  30: "Last 30 days",
  90: "Last 3 months",
  180: "Last 6 months",
  365: "Last year",
  1095: "Last 3 years",
};

export function ScanPanel({
  progress,
  running,
  error,
  onStart,
  onCancel,
}: {
  progress: ScanProgressDto | null;
  running: boolean;
  error: string | null;
  onStart: (lookbackDays: number) => void;
  onCancel: () => void;
}) {
  /**
    * Thirty days by default.
    *
    * A first scan should finish while the person is still watching it, and a
    * month of mail is enough to see who the worst offenders are. Anyone who
    * wants their whole history can widen the window and scan again.
    */
  const [lookback, setLookback] = useState<number>(DEFAULT_LOOKBACK_DAYS);
  const neverScanned = !progress;

  return (
    <section className={styles.panel}>
      <div className={styles.row}>
        <div className={styles.copy}>
          <h2 className={styles.title}>
            {running
              ? "Scanning your mailbox…"
              : neverScanned
                ? "Scan your mailbox"
                : "Scan again"}
          </h2>
          <p className={styles.description}>
            {running
              ? `${progress?.processedMessages.toLocaleString() ?? 0} messages read · ${
                  progress?.foundSenders.toLocaleString() ?? 0
                } senders found`
              : neverScanned
                ? "Starts with the last 30 days. A scan reads message headers — who sent it, when, and how that sender says to unsubscribe."
                : "Scanning again picks up anything new, and a longer window looks further back."}
          </p>
        </div>

        <div className={styles.controls}>
          <Select
            id="lookback"
            label="How far back to scan"
            value={lookback}
            disabled={running}
            onChange={(event) => setLookback(Number(event.target.value))}
          >
            {LOOKBACK_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {LOOKBACK_LABEL[days] ?? `Last ${days} days`}
              </option>
            ))}
          </Select>

          {running ? (
            <Button variant="secondary" onClick={onCancel}>
              Stop
            </Button>
          ) : (
            <Button variant="primary" onClick={() => onStart(lookback)}>
              {neverScanned ? "Start scan" : "Rescan"}
            </Button>
          )}
        </div>
      </div>

      {running || (progress && !progress.done) ? (
        <div className={styles.progress}>
          <ProgressBar value={progress?.fraction ?? 0} label="Scan progress" />
        </div>
      ) : null}

      {error ? (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={() => onStart(lookback)}>
            Try again
          </Button>
        </div>
      ) : null}
    </section>
  );
}
