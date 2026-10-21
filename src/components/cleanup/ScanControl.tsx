"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, CircleAlert, RefreshCw, Square } from "lucide-react";
import { DEFAULT_LOOKBACK_DAYS, LOOKBACK_OPTIONS, SCAN_STATUS } from "@/lib/constants";
import { periodLabel, scanWhen } from "@/lib/home/format";
import type { ScanProgressDto } from "@/lib/api/types";
import glass from "@/components/home/glass.module.css";
import styles from "./ScanControl.module.css";

/**
 * The compact scan controls in Cleanup's heading row.
 *
 * It says when the mailbox was last looked at, and offers a rescan with a
 * choice of period. Nothing here starts a scan by itself: the page opens on
 * the last result, and a scan runs only when someone presses the button.
 * While one is running the button becomes Stop, so a second scan cannot be
 * started on top of it. The page slots its own controls (the mailbox, History)
 * around these so the whole row reads as one line.
 */

export type ScanState = {
  progress: ScanProgressDto | null;
  running: boolean;
  error: string | null;
  loaded: boolean;
  start: (lookbackDays: number) => void;
  cancel: () => void;
};

export function ScanControl({
  scan,
  leading,
  trailing,
}: {
  scan: ScanState;
  /** Before the period: the mailbox switcher. */
  leading?: ReactNode;
  /** After the scan button: History. */
  trailing?: ReactNode;
}) {
  const { progress, running, loaded } = scan;
  const [lookback, setLookback] = useState<number>(DEFAULT_LOOKBACK_DAYS);
  // Start and Stop share a spot, so the second half of a double-click on
  // "Scan again" must not stop the scan it just started.
  const startedAt = useRef(0);

  // Offer the period the last scan used, once we know it.
  const lastLookback = progress?.lookbackDays;
  useEffect(() => {
    if (lastLookback) setLookback(lastLookback);
  }, [lastLookback]);

  const unfinished =
    !running &&
    progress !== null &&
    (progress.status === SCAN_STATUS.RUNNING ||
      progress.status === SCAN_STATUS.ERROR ||
      progress.status === SCAN_STATUS.CANCELLED);

  const when = progress?.finishedAt ?? progress?.startedAt ?? null;
  const percent = Math.round((progress?.fraction ?? 0) * 100);

  return (
    <div className={styles.block}>
      <div className={styles.row}>
        <div className={styles.facts} aria-live="polite">
          {!loaded ? (
            <span className={styles.skeleton} aria-hidden="true" />
          ) : running ? (
            <p>
              Scanning · {(progress?.processedMessages ?? 0).toLocaleString("en")} messages checked ·{" "}
              {(progress?.foundSenders ?? 0).toLocaleString("en")} senders
            </p>
          ) : progress && when ? (
            <p>
              Last scan · {scanWhen(when)}
              {unfinished ? (
                <span className={styles.warn}>
                  <CircleAlert size={14} strokeWidth={2} aria-hidden />
                  Didn’t finish
                </span>
              ) : null}
            </p>
          ) : (
            <p>Not scanned yet · reads message headers only</p>
          )}
        </div>

        <div className={styles.controls}>
          {leading}

          <span className={styles.period}>
            <label className="srOnly" htmlFor="scan-period">
              Period to scan
            </label>
            <select
              id="scan-period"
              className={`${styles.select} ${glass.button}`}
              value={lookback}
              disabled={running}
              onChange={(event) => setLookback(Number(event.target.value))}
            >
              {LOOKBACK_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {periodLabel(days)}
                </option>
              ))}
            </select>
            <ChevronDown className={styles.chevron} size={17} strokeWidth={1.75} aria-hidden />
          </span>

          {running ? (
            <button
              type="button"
              className={`${styles.action} ${glass.button}`}
              onClick={() => {
                if (Date.now() - startedAt.current > 500) scan.cancel();
              }}
            >
              <Square size={15} strokeWidth={2} aria-hidden />
              Stop scan
            </button>
          ) : (
            <button
              type="button"
              className={progress ? `${styles.action} ${glass.button}` : `${styles.action} ${styles.primary}`}
              disabled={!loaded}
              onClick={() => {
                startedAt.current = Date.now();
                scan.start(lookback);
              }}
            >
              <RefreshCw size={19} strokeWidth={1.6} aria-hidden />
              {progress ? "Scan again" : "Start scan"}
            </button>
          )}

          {trailing}
        </div>
      </div>

      {running ? (
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="Scan progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span className={styles.fill} style={{ inlineSize: `${percent}%` }} />
        </div>
      ) : null}

      {scan.error ? (
        <p className={styles.error} role="alert">
          <CircleAlert size={15} strokeWidth={2} aria-hidden />
          {scan.error}
        </p>
      ) : null}
    </div>
  );
}
