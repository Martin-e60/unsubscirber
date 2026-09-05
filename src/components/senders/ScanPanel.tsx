"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Select } from "@/components/ui/Select";
import { LOOKBACK_OPTIONS } from "@/lib/constants";
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
  const [lookback, setLookback] = useState(365);
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
              : "We read only message headers — never the contents of your email."}
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

      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
