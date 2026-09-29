"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, CircleAlert, RefreshCw, Search, Square } from "lucide-react";
// The short serif accent in the title — the same face Home and Cleanup use.
import "@fontsource-variable/newsreader/wght-italic.css";
import { useApp } from "@/components/layout/AppShell";
import { useArchive } from "@/hooks/useArchive";
import { useScan } from "@/hooks/useScan";
import { DEFAULT_LOOKBACK_DAYS, SCAN_STATUS } from "@/lib/constants";
import { periodLabel } from "@/lib/home/format";
import { ArchiveRow } from "./ArchiveRow";
import { checkedWhen, plural } from "./format";
import styles from "./UnsubscribedView.module.css";

/**
 * Unsubscribed: a calm archive of confirmed unsubscribes, and whether any of
 * those lists has written since.
 *
 * Only confirmed unsubscribes live here. Requests that were only sent,
 * attempts waiting on a click, and failures stay in Cleanup's To review, each
 * under its own filter, and every attempt is in the attempt history.
 *
 * "Check again" is an ordinary mailbox scan — the same read-only, headers-only
 * scan Cleanup runs — reaching back far enough to cover the oldest
 * unsubscribe. Nothing watches the inbox in between: observations change only
 * when Gmail is scanned.
 */

const PAGE_SIZE = 10;

/** Scan errors that mean Gmail needs connecting again. */
function needsReconnect(message: string): boolean {
  return /reconnect|refresh token|invalid_grant|unauthori[sz]ed|\b401\b|\b403\b/i.test(message);
}

export function UnsubscribedView() {
  const { refreshStats, demo, basePath } = useApp();
  const archive = useArchive({ pageSize: PAGE_SIZE });

  // What this page's own "Check again" did, so a stop or failure is reported
  // here without being mistaken for a check that completed.
  const [attempt, setAttempt] = useState<"none" | "started" | "stopped">("none");

  const scan = useScan({
    // Opening the page never scans.
    resume: false,
    onFinished: () => {
      void archive.refresh();
      void refreshStats();
    },
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const anchor = useRef<{ id: string; top: number } | null>(null);

  /* Opening one sender closes another. When the one closing sits above, the
     page would jump; the clicked row is held where it was instead. */
  const toggle = useCallback((id: string, button: HTMLButtonElement) => {
    anchor.current = { id, top: button.getBoundingClientRect().top };
    setOpenId((current) => (current === id ? null : id));
  }, []);

  useLayoutEffect(() => {
    const held = anchor.current;
    anchor.current = null;
    if (!held) return;
    const button = document.getElementById(`archive-row-${held.id}`);
    if (!button) return;
    const shift = button.getBoundingClientRect().top - held.top;
    if (Math.abs(shift) > 1) window.scrollBy({ top: shift, behavior: "instant" as ScrollBehavior });
  }, [openId]);

  const lookback = archive.checkLookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  // Start and Stop share a spot: the second half of a double-click on
  // "Check again" must not stop the check it just started.
  const startedAt = useRef(0);
  const startCheck = () => {
    startedAt.current = Date.now();
    setAttempt("started");
    scan.start(lookback);
  };
  const stopCheck = () => {
    if (Date.now() - startedAt.current < 500) return;
    setAttempt("stopped");
    scan.cancel();
  };

  const running = scan.running;
  // Only a check started from this page reports failure here; an older scan's
  // error belongs to wherever it was started.
  const failed =
    running || attempt !== "started"
      ? null
      : scan.progress?.status === SCAN_STATUS.ERROR
        ? scan.progress.error ?? "The check didn’t finish."
        : scan.error;
  const stopped = !running && attempt === "stopped";
  const percent = Math.round((scan.progress?.fraction ?? 0) * 100);
  const measurable = running && (scan.progress?.totalEstimate ?? 0) > 0;

  /* --- List states ------------------------------------------------------------ */

  const searching = archive.appliedSearch.length > 0;
  let listBody: ReactNode;

  if (!archive.loaded && archive.loading) {
    listBody = (
      <ul className={styles.skeleton} aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index}>
            <span />
            <span />
          </li>
        ))}
      </ul>
    );
  } else if (archive.error && archive.items.length === 0) {
    listBody = (
      <Empty title="Couldn’t load your unsubscribes" body={archive.error}>
        <button type="button" className={styles.textButton} onClick={() => void archive.refresh()}>
          Try again
        </button>
      </Empty>
    );
  } else if (archive.items.length === 0 && searching) {
    listBody = (
      <Empty
        title={`No unsubscribed sender matches “${archive.appliedSearch}”`}
        body="Search looks at sender names and email addresses in this archive."
      >
        <button type="button" className={styles.textButton} onClick={() => archive.setSearch("")}>
          Clear search
        </button>
      </Empty>
    );
  } else if (archive.items.length === 0) {
    listBody = (
      <Empty
        title="No confirmed unsubscribes yet"
        body="When a sender confirms an unsubscribe, it lands here. Requests that were only sent, or that still need a click, stay in Cleanup until they’re confirmed."
      >
        <Link href={`${basePath}/cleanup`} className={styles.textButton}>
          Go to Cleanup
          <ArrowUpRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      </Empty>
    );
  } else {
    listBody = (
      <ul className={styles.list} aria-label="Confirmed unsubscribes" aria-busy={archive.loading || undefined}>
        {archive.items.map((item) => (
          <ArchiveRow
            key={item.senderId}
            item={item}
            open={openId === item.senderId}
            demo={demo}
            basePath={basePath}
            onToggle={(button) => toggle(item.senderId, button)}
          />
        ))}
      </ul>
    );
  }

  const countLabel = !archive.loaded
    ? ""
    : searching
      ? `${archive.total.toLocaleString("en")} of ${plural(archive.archiveTotal, "unsubscribed", "unsubscribed")}`
      : plural(archive.archiveTotal, "unsubscribed", "unsubscribed");

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.crumb}>Unsubscribed</p>
        <div className={styles.head}>
          <div>
            <h1 className={styles.title}>
              A <span className={styles.accent}>quieter</span> inbox.
            </h1>
            <p className={styles.lede}>The mailing lists you’ve left behind.</p>
          </div>
          <span className={styles.art} aria-hidden="true">
            <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="12" y="24" width="40" height="28" rx="6" transform="rotate(-8 32 38)" />
              <path d="M14.5 29.5 L32.5 40 L50 24.5" transform="rotate(-8 32 38)" />
              <path d="M27 14 L24 8" />
              <path d="M35 13 L37 6" />
            </svg>
          </span>
        </div>
      </header>

      <section className={styles.check} aria-label="Follow-up checks">
        <div className={styles.checkInfo} aria-live="polite">
          <RefreshCw
            className={styles.checkIcon}
            data-spinning={running || undefined}
            size={20}
            strokeWidth={1.75}
            aria-hidden
          />
          <div>
            {running ? (
              <>
                <p className={styles.checkTitle}>
                  {demo ? "Checking the sample mailbox" : "Checking Gmail"} ·{" "}
                  {periodLabel(scan.progress?.lookbackDays ?? lookback)}
                </p>
                <p className={styles.checkSub}>
                  {(scan.progress?.processedMessages ?? 0).toLocaleString("en")} messages read so far.
                  Your list stays as it is until the check finishes.
                </p>
              </>
            ) : (
              <>
                <p className={styles.checkTitle}>
                  {archive.lastCheck
                    ? `Last checked ${checkedWhen(archive.lastCheck.finishedAt)}`
                    : archive.loaded
                      ? "Not checked yet"
                      : " "}
                </p>
                <p className={styles.checkSub}>Checks for mail received after unsubscribing.</p>
              </>
            )}
          </div>
        </div>

        {running ? (
          <button type="button" className={styles.checkButton} onClick={stopCheck}>
            <Square size={16} strokeWidth={2} aria-hidden />
            Stop checking
          </button>
        ) : (
          <button
            type="button"
            className={styles.checkButton}
            onClick={startCheck}
            disabled={!scan.loaded || !archive.loaded || archive.archiveTotal === 0}
            title={archive.archiveTotal === 0 ? "Nothing to check yet" : undefined}
          >
            <RefreshCw size={19} strokeWidth={1.9} aria-hidden />
            Check again
          </button>
        )}

        {running ? (
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Check progress"
            aria-valuemin={measurable ? 0 : undefined}
            aria-valuemax={measurable ? 100 : undefined}
            aria-valuenow={measurable ? percent : undefined}
            data-indeterminate={!measurable || undefined}
          >
            <span style={measurable ? { inlineSize: `${percent}%` } : undefined} />
          </div>
        ) : null}

        {failed ? (
          <div className={styles.alert} role="alert">
            <CircleAlert size={17} strokeWidth={2} aria-hidden />
            <p>
              The check didn’t finish, so nothing below changed. <span className={styles.alertDetail}>{failed}</span>
            </p>
            <div className={styles.alertActions}>
              {needsReconnect(failed) && !demo ? (
                <Link href="/connect" className={styles.textButton}>
                  Reconnect Gmail
                </Link>
              ) : null}
              <button type="button" className={styles.textButton} onClick={startCheck}>
                Try again
              </button>
            </div>
          </div>
        ) : stopped ? (
          <div className={styles.alert} role="status" data-tone="quiet">
            <p>Check stopped. Nothing below changed; results come from the last check that finished.</p>
          </div>
        ) : null}
      </section>

      <section className={styles.panel} aria-label="Your unsubscribes">
        <div className={styles.toolbar}>
          <div className={styles.searchField}>
            <Search className={styles.searchIcon} size={20} strokeWidth={1.75} aria-hidden />
            <label className="srOnly" htmlFor="archive-search">
              Find a sender
            </label>
            <input
              id="archive-search"
              type="search"
              className={styles.search}
              placeholder="Find a sender"
              autoComplete="off"
              value={archive.search}
              onChange={(event) => archive.setSearch(event.target.value)}
            />
          </div>
          <p className={styles.count} aria-live="polite">
            {countLabel}
          </p>
        </div>

        {archive.error && archive.items.length > 0 ? (
          <p className={styles.inlineError} role="alert">
            <CircleAlert size={16} strokeWidth={2} aria-hidden />
            {archive.error}
          </p>
        ) : null}

        {listBody}

        {archive.hasMore ? (
          <div className={styles.moreRow}>
            <button
              type="button"
              className={styles.more}
              onClick={() => void archive.loadMore()}
              disabled={archive.loadingMore}
            >
              {archive.loadingMore ? "Loading…" : "Show more"}
              <ArrowDown size={17} strokeWidth={2} aria-hidden />
            </button>
            <span className="srOnly" aria-live="polite">
              Showing {archive.items.length} of {archive.total}
            </span>
          </div>
        ) : null}
      </section>

      <footer className={styles.foot}>
        <p>
          Observations update when Gmail is scanned — here or from Cleanup. Tidely doesn’t watch your
          inbox in the background.
        </p>
        <p className={styles.footLinks}>
          <Link href={`${basePath}/cleanup?status=REQUESTED`} className={styles.footLink}>
            Requests sent, pending clicks and failures are in Cleanup
          </Link>
          <Link href={`${basePath}/history`} className={styles.footLink}>
            Every attempt
          </Link>
        </p>
      </footer>
    </div>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <h2 className={styles.emptyTitle}>{title}</h2>
      <p className={styles.emptyBody}>{body}</p>
      {children ? <div className={styles.emptyAction}>{children}</div> : null}
    </div>
  );
}
