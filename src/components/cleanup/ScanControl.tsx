"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, RefreshCw, Square } from "lucide-react";
import { DEFAULT_LOOKBACK_DAYS, LOOKBACK_OPTIONS, SCAN_STATUS } from "@/lib/constants";
import { periodLabel, scanWhen } from "@/lib/home/format";
import type { ScanProgressDto } from "@/lib/api/types";
import buttons from "./buttons.module.css";
import styles from "./ScanControl.module.css";

/**
 * The compact scan block at the top right of Cleanup.
 *
 * It says when the mailbox was last looked at and how far back, and offers a
 * rescan with a choice of period. Nothing here starts a scan by itself: the
 * page opens on the last result, and a scan runs only when someone presses
 * the button. While one is running the button becomes Stop, so a second scan
 * cannot be started on top of it.
 */

export type ScanState = {
  progress: ScanProgressDto | null;
  running: boolean;
  error: string | null;
  loaded: boolean;
  start: (lookbackDays: number) => void;
  cancel: () => void;
};

export function ScanControl({ scan }: { scan: ScanState }) {
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
            <>
              <p className={styles.primaryFact}>Scanning · {periodLabel(progress?.lookbackDays ?? lookback)}</p>
              <p>
                {(progress?.processedMessages ?? 0).toLocaleString("en")} messages checked ·{" "}
                {(progress?.foundSenders ?? 0).toLocaleString("en")} senders
              </p>
            </>
          ) : progress && when ? (
            <>
              <p className={styles.primaryFact}>Last scan · {scanWhen(when)}</p>
              {unfinished ? (
                <p className={styles.warn}>
                  <CircleAlert size={14} strokeWidth={2} aria-hidden />
                  Didn’t finish · {periodLabel(progress.lookbackDays)}
                </p>
              ) : (
                <p>
                  <Check size={14} strokeWidth={2.25} aria-hidden className={styles.check} />
                  {periodLabel(progress.lookbackDays)}
                </p>
              )}
            </>
          ) : (
            <>
              <p className={styles.primaryFact}>Not scanned yet</p>
              <p>Reads message headers only</p>
            </>
          )}
        </div>

        <div className={styles.controls}>
          <span className={styles.period}>
            <label className="srOnly" htmlFor="scan-period">
              Period to scan
            </label>
            <select
              id="scan-period"
              className={styles.select}
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
            <ChevronDown className={styles.chevron} size={15} strokeWidth={1.75} aria-hidden />
          </span>

          {running ? (
            <button
              type="button"
              className={`${buttons.secondary} ${styles.action}`}
              onClick={() => {
                if (Date.now() - startedAt.current > 500) scan.cancel();
              }}
            >
              Stop scan
              <Square size={14} strokeWidth={2} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className={`${progress ? buttons.secondary : buttons.primary} ${styles.action}`}
              disabled={!loaded}
              onClick={() => {
                startedAt.current = Date.now();
                scan.start(lookback);
              }}
            >
              {progress ? "Scan again" : "Start scan"}
              <RefreshCw className={styles.spin} size={17} strokeWidth={1.75} aria-hidden />
            </button>
          )}
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
