"use client";

import Link from "next/link";
import { CircleAlert, RefreshCw, Square } from "lucide-react";
import { DEFAULT_LOOKBACK_DAYS, SCAN_STATUS } from "@/lib/constants";
import { periodLabel, relativeTime, scanWhen } from "@/lib/home/format";
import type { ScanProgressDto, StatsDto } from "@/lib/api/types";
import styles from "./ScanOverview.module.css";

/**
 * The scan overview at the top of Home: when the mailbox was last scanned, how
 * many senders it found, and how many of them are still waiting on a decision.
 *
 * The card follows the real state rather than assuming the happy path — no
 * Gmail, never scanned, scanning, a finished scan, nothing found, or a scan that
 * did not finish. Nothing here starts a scan on its own; every scan is a button
 * someone pressed.
 *
 * The three figures come from one place, the mailbox's senders as Home's stats
 * count them: all of them, those still waiting for a decision (the same count
 * as Cleanup's To review), and the rest — which have a decision — as reviewed.
 */

type Mode =
  | "loading"
  | "noGmail"
  | "firstScan"
  | "scanning"
  | "finished"
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
  return "finished";
}

function count(value: number): string {
  return value.toLocaleString("en");
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <p className={styles.stat}>
      <strong className={styles.statValue}>{count(value)}</strong>
      <span className={styles.statLabel}>{label}</span>
    </p>
  );
}

export function ScanOverview({
  connected,
  stats,
  scan,
}: {
  connected: boolean | null;
  stats: StatsDto | null;
  scan: ScanControls;
}) {
  const mode = modeFor(connected, stats, scan);
  const progress = scan.progress;
  const lookback = progress?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const when = progress?.finishedAt ?? progress?.startedAt ?? null;

  const total = stats?.totalSenders ?? 0;
  const notReviewed = Math.min(stats?.activeSenders ?? 0, total);
  const reviewed = total - notReviewed;
  const percent = Math.round((progress?.fraction ?? 0) * 100);

  // --- Top row: what this card is about, and the one thing to do ---------------------

  let title = "Latest scan";
  let when1: React.ReactNode = null;
  let when2: React.ReactNode = null;
  let action: React.ReactNode = null;

  const scanAgain = (
    <button
      type="button"
      className={styles.action}
      onClick={() => scan.start(lookback)}
    >
      <RefreshCw size={28} strokeWidth={2.2} aria-hidden />
      Scan again
    </button>
  );

  switch (mode) {
    case "loading":
      break;
    case "noGmail":
      when1 = "Not yet";
      action = (
        <Link href="/connect" className={styles.action}>
          Connect Gmail
        </Link>
      );
      break;
    case "firstScan":
      when1 = "Not yet";
      action = (
        <button
          type="button"
          className={styles.action}
          onClick={() => scan.start(DEFAULT_LOOKBACK_DAYS)}
        >
          <RefreshCw size={28} strokeWidth={2.2} aria-hidden />
          Start first scan
        </button>
      );
      break;
    case "scanning":
      title = "Scanning your inbox…";
      when1 = periodLabel(lookback);
      when2 = progress?.startedAt
        ? `Started ${relativeTime(progress.startedAt).toLowerCase()}`
        : "Starting…";
      action = (
        <button type="button" className={styles.action} onClick={scan.cancel}>
          <Square size={20} strokeWidth={1.75} aria-hidden />
          Stop scan
        </button>
      );
      break;
    case "interrupted":
      when1 = when ? scanWhen(when) : null;
      when2 = (
        <>
          <CircleAlert size={20} strokeWidth={1.75} aria-hidden />
          Didn’t finish · {periodLabel(lookback)}
        </>
      );
      action = scanAgain;
      break;
    case "finished":
      when1 = when ? scanWhen(when) : null;
      when2 = periodLabel(lookback);
      action = scanAgain;
      break;
  }

  // --- Lower row ----------------------------------------------------------------------

  let lower: React.ReactNode;

  if (mode === "loading") {
    lower = <div className={styles.skeleton} aria-hidden="true" />;
  } else if (mode === "noGmail") {
    lower = (
      <p className={styles.note}>
        Connect Gmail to find your subscriptions. You’ll see exactly what Google
        asks you to approve before anything is connected.
      </p>
    );
  } else if (mode === "firstScan") {
    lower = (
      <p className={styles.note}>
        Tidely looks at the {periodLabel(DEFAULT_LOOKBACK_DAYS).toLowerCase()} of
        your Gmail and groups mailing lists by sender. It reads message headers
        only.
      </p>
    );
  } else if (mode === "scanning") {
    lower = (
      <div className={styles.figures}>
        <Stat
          value={progress?.processedMessages ?? 0}
          label={progress?.processedMessages === 1 ? "message checked" : "messages checked"}
        />
        <Stat
          value={progress?.foundSenders ?? 0}
          label={progress?.foundSenders === 1 ? "sender found" : "senders found"}
        />
        <div className={styles.progress}>
          <div
            className={styles.track}
            role="progressbar"
            aria-label="Scan progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span className={styles.fill} style={{ inlineSize: `${percent}%` }} />
          </div>
          <p className={styles.caption}>{percent}% scanned</p>
        </div>
      </div>
    );
  } else {
    lower = (
      <div className={styles.figures}>
        <Stat value={total} label={total === 1 ? "sender found" : "senders found"} />
        <Stat
          value={notReviewed}
          label={notReviewed === 1 ? "sender not reviewed" : "senders not reviewed"}
        />
        {total > 0 ? (
          <div className={styles.progress}>
            <div
              className={styles.track}
              role="progressbar"
              aria-label="Senders reviewed"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={reviewed}
              aria-valuetext={`${count(reviewed)} of ${count(total)} reviewed`}
            >
              <span
                className={styles.fill}
                style={{ inlineSize: `${(reviewed / total) * 100}%` }}
              />
            </div>
            <p className={styles.caption}>
              {count(reviewed)} of {count(total)} reviewed
            </p>
          </div>
        ) : (
          <p className={`${styles.note} ${styles.noteInline}`}>
            The last scan found no subscription email in the{" "}
            {periodLabel(lookback).toLowerCase()}. A longer period, chosen in
            Cleanup, may find more.
          </p>
        )}
      </div>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="scan-title" aria-busy={mode === "loading"}>
      <div className={styles.top}>
        <h2 className={styles.title} id="scan-title" aria-live="polite">
          {title}
        </h2>
        {when1 ? <p className={styles.when}>{when1}</p> : null}
        {when2 ? <p className={`${styles.when} ${styles.period}`}>{when2}</p> : null}
        {action ? <div className={styles.actionSlot}>{action}</div> : null}
      </div>

      <hr className={styles.rule} />

      <div className={styles.lower}>{lower}</div>

      {scan.error && mode !== "loading" ? (
        <p className={styles.error} role="alert">
          <CircleAlert size={18} strokeWidth={2} aria-hidden />
          {scan.error}
        </p>
      ) : null}
    </section>
  );
}
