"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Inbox,
  RefreshCw,
  Square,
} from "lucide-react";
import { DEFAULT_LOOKBACK_DAYS, SCAN_STATUS } from "@/lib/constants";
import { periodLabel, relativeTime, scanWhen } from "@/lib/home/format";
import type { ScanProgressDto, StatsDto } from "@/lib/api/types";
import styles from "./NextStep.module.css";

/**
 * "Your next step": the one thing worth doing now, and when the mailbox was
 * last looked at.
 *
 * The panel follows the real state rather than assuming the happy path —
 * no Gmail, never scanned, scanning, senders to review, all reviewed, nothing
 * found, or a scan that did not finish. Nothing here starts a scan on its
 * own; every scan is a button someone pressed.
 */

type Mode =
  | "loading"
  | "noGmail"
  | "firstScan"
  | "scanning"
  | "review"
  | "reviewed"
  | "empty"
  | "interrupted";

export type ScanControls = {
  progress: ScanProgressDto | null;
  running: boolean;
  error: string | null;
  loaded: boolean;
  start: (lookbackDays: number) => void;
  cancel: () => void;
};

function modeFor(
  connected: boolean | null,
  stats: StatsDto | null,
  scan: ScanControls,
): Mode {
  if (connected === null) return "loading";
  if (!connected) return "noGmail";
  if (!scan.loaded || stats === null) return "loading";
  if (scan.running) return "scanning";
  if (!scan.progress) return "firstScan";
  // A scan still marked running but not being driven by this page was
  // stopped, or left when a tab closed. Home never resumes it on its own, so
  // it is shown as unfinished rather than as in progress.
  if (
    scan.progress.status === SCAN_STATUS.RUNNING ||
    scan.progress.status === SCAN_STATUS.ERROR ||
    scan.progress.status === SCAN_STATUS.CANCELLED
  ) {
    return "interrupted";
  }
  if (stats.activeSenders > 0) return "review";
  return stats.totalSenders > 0 ? "reviewed" : "empty";
}

export function NextStep({
  connected,
  stats,
  scan,
  basePath,
}: {
  connected: boolean | null;
  stats: StatsDto | null;
  scan: ScanControls;
  basePath: string;
}) {
  const mode = modeFor(connected, stats, scan);
  const progress = scan.progress;
  const lookback = progress?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const active = stats?.activeSenders ?? 0;

  const continueCleanup = (
    <Link href={`${basePath}/cleanup`} className={styles.primary}>
      Continue cleanup
      <ArrowUpRight size={18} strokeWidth={2} aria-hidden />
    </Link>
  );

  const scanAgain = (
    <button
      type="button"
      className={styles.secondary}
      onClick={() => scan.start(lookback)}
    >
      Scan again
      <RefreshCw size={17} strokeWidth={1.75} aria-hidden />
    </button>
  );

  let title: string;
  let body: string;
  let action: React.ReactNode = null;

  switch (mode) {
    case "loading":
      title = "";
      body = "";
      break;
    case "noGmail":
      title = "Connect Gmail to find your subscriptions.";
      body =
        "Tidely reads message headers to find mailing lists. You’ll see exactly what Google asks you to approve before anything is connected.";
      action = (
        <Link href="/connect" className={styles.primary}>
          Connect Gmail
          <ArrowUpRight size={18} strokeWidth={2} aria-hidden />
        </Link>
      );
      break;
    case "firstScan":
      title = "Run your first scan.";
      body = `Tidely looks at the ${periodLabel(DEFAULT_LOOKBACK_DAYS).toLowerCase()} of your Gmail and groups mailing lists by sender. It reads message headers only.`;
      action = (
        <button
          type="button"
          className={styles.primary}
          onClick={() => scan.start(DEFAULT_LOOKBACK_DAYS)}
        >
          Start first scan
          <ArrowUpRight size={18} strokeWidth={2} aria-hidden />
        </button>
      );
      break;
    case "scanning":
      title = "Scanning your inbox…";
      body = `${(progress?.processedMessages ?? 0).toLocaleString("en")} messages checked · ${(
        progress?.foundSenders ?? 0
      ).toLocaleString("en")} senders found`;
      break;
    case "review":
      title = `${active.toLocaleString("en")} ${
        active === 1 ? "sender is" : "senders are"
      } ready to review.`;
      body = "Your latest scan is complete. Choose which subscriptions stay.";
      action = continueCleanup;
      break;
    case "reviewed":
      title = "Everything is reviewed.";
      body =
        "Every sender Tidely has found has a decision. Scan again to check for new mailing lists.";
      action = (
        <Link href={`${basePath}/senders`} className={styles.tertiary}>
          See all senders
        </Link>
      );
      break;
    case "empty":
      title = "No mailing lists found.";
      body = `The last scan found no subscription email in the ${periodLabel(
        lookback,
      ).toLowerCase()}. A longer period, chosen in Cleanup, may find more.`;
      action = (
        <Link href={`${basePath}/cleanup`} className={styles.tertiary}>
          Open Cleanup
        </Link>
      );
      break;
    case "interrupted":
      title = "Your last scan didn’t finish.";
      body =
        progress?.status === SCAN_STATUS.ERROR && progress.error
          ? `${progress.error} Anything it found before stopping is saved.`
          : "It stopped before the end. Anything it found so far is saved.";
      action = active > 0 ? continueCleanup : null;
      break;
  }

  const when = progress?.finishedAt ?? progress?.startedAt ?? null;

  return (
    <section className={styles.panel} aria-labelledby="next-step-title" aria-busy={mode === "loading"}>
      <div className={styles.main}>
        <div className={styles.kicker}>
          <span className={styles.kickerIcon} aria-hidden="true">
            <Inbox size={20} strokeWidth={1.75} />
          </span>
          <p className={styles.eyebrow}>Your next step</p>
        </div>

        {mode === "loading" ? (
          <div className={styles.skeleton} aria-hidden="true">
            <span />
            <span />
          </div>
        ) : (
          <div className={styles.copy} aria-live="polite">
            <h2 className={styles.title} id="next-step-title">
              {title}
            </h2>
            <p className={styles.body}>{body}</p>
          </div>
        )}
        {mode === "loading" ? (
          <h2 className="srOnly" id="next-step-title">
            Loading your next step
          </h2>
        ) : null}

        {mode === "scanning" ? (
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Scan progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((progress?.fraction ?? 0) * 100)}
          >
            <span
              className={styles.progressFill}
              style={{ inlineSize: `${Math.round((progress?.fraction ?? 0) * 100)}%` }}
            />
          </div>
        ) : null}

        {action ? <div className={styles.actions}>{action}</div> : null}

        {scan.error && mode !== "loading" ? (
          <p className={styles.error} role="alert">
            <CircleAlert size={16} strokeWidth={2} aria-hidden />
            {scan.error}
          </p>
        ) : null}
      </div>

      <div className={styles.side}>
        {mode === "scanning" ? (
          <>
            <p className={styles.eyebrow}>This scan</p>
            <p className={styles.when}>{periodLabel(lookback)}</p>
            <p className={styles.meta}>
              {progress?.startedAt
                ? `Started ${relativeTime(progress.startedAt).toLowerCase()}`
                : "Starting…"}
            </p>
            <div className={styles.sideAction}>
              <button type="button" className={styles.secondary} onClick={scan.cancel}>
                Stop scan
                <Square size={14} strokeWidth={2} aria-hidden />
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.eyebrow}>Last scan</p>
            {mode === "loading" ? (
              <div className={styles.skeleton} aria-hidden="true">
                <span />
              </div>
            ) : progress && when ? (
              <>
                <p className={styles.when}>{scanWhen(when)}</p>
                {mode === "interrupted" ? (
                  <p className={styles.meta}>
                    <CircleAlert size={15} strokeWidth={2} aria-hidden />
                    Didn’t finish · {periodLabel(lookback)}
                  </p>
                ) : (
                  <p className={styles.meta}>
                    <Check className={styles.check} size={16} strokeWidth={2.25} aria-hidden />
                    {periodLabel(lookback)} scanned
                  </p>
                )}
                <div className={styles.sideAction}>{scanAgain}</div>
              </>
            ) : (
              <>
                <p className={styles.when}>Not yet</p>
                <p className={styles.meta}>
                  {mode === "noGmail"
                    ? "Scans start after Gmail is connected."
                    : "Nothing has been scanned yet."}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
