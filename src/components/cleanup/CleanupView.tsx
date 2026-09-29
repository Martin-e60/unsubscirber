"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownWideNarrow,
  ArrowUpRight,
  ChevronDown,
  CircleAlert,
  Search,
  SquareCheck,
  X,
} from "lucide-react";
// The short serif accent in the title — the same face Home uses.
import "@fontsource-variable/newsreader/wght-italic.css";
import { useApp } from "@/components/layout/AppShell";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useScan } from "@/hooks/useScan";
import { useSenders } from "@/hooks/useSenders";
import { useUnsubscribe } from "@/hooks/useUnsubscribe";
import { DEFAULT_LOOKBACK_DAYS, SENDER_STATUS } from "@/lib/constants";
import type { SenderDto, SenderSort } from "@/lib/api/types";
import { ScanControl } from "./ScanControl";
import { SenderTable } from "./SenderTable";
import { SenderDetails } from "./SenderDetails";
import { OutcomeNotice, type Outcome } from "./OutcomeNotice";
import buttons from "./buttons.module.css";
import styles from "./CleanupView.module.css";

/**
 * Cleanup: the senders still waiting on a decision.
 *
 * Find a sender, look at what Tidely knows about them, keep them or
 * unsubscribe — one at a time from the details panel, or several at once with
 * the checkboxes. Results and history live in Unsubscribed, and kept senders
 * in Senders; this screen only holds what is still undecided.
 *
 * Used by the signed-in app and by the demo alike. In the demo the API client
 * answers from sample data in the browser, so nothing here can reach Gmail.
 */

const PAGE_SIZE = 8;

/** Wide enough for the list and the details side by side. Mirrors the CSS. */
const SIDE_BY_SIDE = "(min-width: 75rem)";

function nameOf(sender: SenderDto): string {
  return sender.name ?? sender.address;
}

function without(set: Set<string>, ids: Iterable<string>): Set<string> {
  const next = new Set(set);
  for (const id of ids) next.delete(id);
  return next;
}

export function CleanupView() {
  const { refreshStats, demo, basePath, accountConnected } = useApp();
  const senders = useSenders({ initialStatus: SENDER_STATUS.ACTIVE, pageSize: PAGE_SIZE });
  const list = senders.senders;

  const sideBySide = useMediaQuery(SIDE_BY_SIDE);
  const sheetMode = sideBySide === false;

  const scan = useScan({
    // Opening Cleanup never scans. An unfinished scan is shown as unfinished.
    resume: false,
    onFinished: () => {
      void senders.refresh();
      void refreshStats();
    },
  });

  const unsubscribe = useUnsubscribe({
    onResult: (id, patch) => senders.patchSender(id, patch),
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const lastIndex = useRef(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // A ref as well as state: a double press must not start two decisions.
  const acting = useRef(false);
  const working = keeping || unsubscribe.running;

  const backRef = useRef<HTMLButtonElement>(null);

  /* --- The open sender ------------------------------------------------------
     When the open sender leaves the list — decided, filtered out, or on
     another page — the one now in its place opens instead, so a run of
     decisions moves down the list without any extra clicks. */

  const activeIndex = list.findIndex((sender) => sender.id === activeId);
  const current =
    activeIndex >= 0
      ? list[activeIndex]
      : list.length
        ? list[Math.min(lastIndex.current, list.length - 1)]
        : null;

  useEffect(() => {
    if (activeIndex >= 0) {
      lastIndex.current = activeIndex;
      return;
    }
    if (!current) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (activeId !== null) setAnnouncement(`Now showing ${nameOf(current)}.`);
    setActiveId(current.id);
  }, [activeIndex, activeId, current]);

  // Ticked senders that are no longer on screen are unticked, so a bulk
  // action can never reach a sender you cannot see.
  useEffect(() => {
    setChecked((previous) => {
      if (previous.size === 0) return previous;
      const visible = new Set(list.map((sender) => sender.id));
      const next = new Set([...previous].filter((id) => visible.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [list]);

  // A pending "are you sure" never carries over to a different selection.
  useEffect(() => {
    setConfirming(false);
  }, [checked]);

  // Asking moves focus to Cancel, the safe answer, so a second Enter on the
  // same spot cannot confirm by accident.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  const confirmShownAt = useRef(0);
  useEffect(() => {
    if (!confirming) return;
    confirmShownAt.current = Date.now();
    cancelRef.current?.focus();
  }, [confirming]);

  /* --- The details sheet on narrow screens --------------------------------- */

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    // Back to the row that was open, so the place in the list is kept.
    const id = current?.id;
    requestAnimationFrame(() => {
      if (!id) return;
      document.querySelector<HTMLButtonElement>(`[data-sender-id="${CSS.escape(id)}"]`)?.focus();
    });
  }, [current?.id]);

  useEffect(() => {
    if (!sheetMode || !current) setSheetOpen(false);
  }, [sheetMode, current]);

  const sheetVisible = sheetMode && sheetOpen && current !== null;

  useEffect(() => {
    if (!sheetVisible) return;
    backRef.current?.focus();

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSheet();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [sheetVisible, closeSheet]);

  const activate = (id: string, open: boolean) => {
    setActiveId(id);
    if (open && sheetMode) setSheetOpen(true);
  };

  /* --- Decisions -------------------------------------------------------------- */

  const afterDecision = async () => {
    await senders.refresh();
    void refreshStats();
  };

  const keep = async (ids: string[]) => {
    const targets = list.filter((sender) => ids.includes(sender.id));
    if (acting.current || targets.length === 0) return;
    acting.current = true;
    setKeeping(true);
    setOutcome(null);

    try {
      const results = await Promise.all(targets.map((sender) => senders.keepSender(sender.id)));
      const kept = targets
        .filter((_, index) => results[index])
        .map((sender) => ({ id: sender.id, name: nameOf(sender) }));
      const failed = targets.filter((_, index) => !results[index]).map(nameOf);

      // The notice explains any failure, so the list's generic error is not
      // repeated beside it.
      if (failed.length) senders.clearError();
      setOutcome({ kind: "keep", kept, failed });
      setChecked((previous) => without(previous, ids));
      await afterDecision();
    } finally {
      acting.current = false;
      setKeeping(false);
    }
  };

  const undoKeep = async (items: { id: string; name: string }[]) => {
    if (acting.current || items.length === 0) return;
    acting.current = true;
    setKeeping(true);

    try {
      const results = await Promise.all(items.map((item) => senders.restoreSender(item.id)));
      const restored = items.filter((_, index) => results[index]);
      if (restored.length !== items.length) senders.clearError();
      setOutcome({
        kind: "restored",
        names: restored.map((item) => item.name),
        failed: items.filter((_, index) => !results[index]).map((item) => item.name),
      });
      await afterDecision();
      // Reopen what came back, now that the refreshed list contains it.
      if (restored[0]) setActiveId(restored[0].id);
    } finally {
      acting.current = false;
      setKeeping(false);
    }
  };

  const runUnsubscribe = async (ids: string[]) => {
    const targets = list.filter((sender) => ids.includes(sender.id));
    if (acting.current || targets.length === 0) return;
    acting.current = true;
    setConfirming(false);
    setOutcome(null);

    try {
      const eligible = targets.filter((sender) => sender.canUnsubscribe);
      const skipped = targets.filter((sender) => !sender.canUnsubscribe).map(nameOf);
      const names = new Map(targets.map((sender) => [sender.id, nameOf(sender)]));
      const order = eligible.map((sender) => sender.id);

      const results = eligible.length ? await unsubscribe.run(order) : [];
      results.sort((a, b) => order.indexOf(a.senderId) - order.indexOf(b.senderId));

      setOutcome({
        kind: "unsubscribe",
        items: results.map((result) => ({
          name: names.get(result.senderId) ?? "This sender",
          result,
        })),
        skipped,
      });
      setChecked((previous) => without(previous, ids));
      await afterDecision();
    } finally {
      acting.current = false;
    }
  };

  /* --- Selection ------------------------------------------------------------------ */

  const toggle = (id: string) =>
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = () => {
    const ids = list
      .filter((sender) => !unsubscribe.pending.has(sender.id))
      .map((sender) => sender.id);
    setChecked((previous) =>
      ids.every((id) => previous.has(id)) ? without(previous, ids) : new Set([...previous, ...ids]),
    );
  };

  const checkedSenders = list.filter((sender) => checked.has(sender.id));
  const checkedUnsubscribable = checkedSenders.filter((sender) => sender.canUnsubscribe).length;

  /* --- Paging, search and sort ------------------------------------------------- */

  const goToPage = (page: number) => {
    lastIndex.current = 0;
    setActiveId(null);
    senders.setPage(page);
  };

  const onSearch = (value: string) => {
    lastIndex.current = 0;
    senders.setSearch(value);
  };

  const onSort = (value: SenderSort) => {
    lastIndex.current = 0;
    senders.setSort(value);
  };

  /* --- Empty states ---------------------------------------------------------------- */

  // What the rows on screen were actually filtered by, not what is still
  // being typed.
  const appliedSearch = senders.appliedSearch.trim();
  const searching = appliedSearch.length > 0;
  const firstLoad = senders.loading && list.length === 0 && senders.total === 0;

  let empty: ReactNode;
  if (senders.error) {
    empty = (
      <EmptyPanel title="Couldn’t load your senders" body={senders.error}>
        <button type="button" className={`${buttons.secondary} ${buttons.small}`} onClick={() => void senders.refresh()}>
          Try again
        </button>
      </EmptyPanel>
    );
  } else if (searching) {
    empty = (
      <EmptyPanel
        title={`No senders match “${appliedSearch}”`}
        body="Search looks at sender names and email addresses among the senders waiting for review."
      >
        <button type="button" className={`${buttons.secondary} ${buttons.small}`} onClick={() => onSearch("")}>
          Clear search
        </button>
      </EmptyPanel>
    );
  } else if (scan.running) {
    empty = (
      <EmptyPanel
        title="Scanning your mailbox…"
        body="Senders will appear here as soon as the scan finishes. You can stop it at any time."
      />
    );
  } else if (scan.loaded && !scan.progress) {
    empty = (
      <EmptyPanel
        title="Run your first scan"
        body="Tidely looks through the last 30 days of Gmail and groups mailing lists by sender. It reads message headers only."
      >
        <button
          type="button"
          className={`${buttons.primary} ${buttons.small}`}
          onClick={() => scan.start(DEFAULT_LOOKBACK_DAYS)}
        >
          Start first scan
          <ArrowUpRight size={17} strokeWidth={2} aria-hidden />
        </button>
      </EmptyPanel>
    );
  } else {
    empty = (
      <EmptyPanel
        title="Nothing left to review"
        body="Every sender Tidely has found has a decision. Scan again, or a longer period, to look for new mailing lists."
      >
        <div className={styles.emptyLinks}>
          <Link href={`${basePath}/senders`} className={styles.inlineLink}>
            Kept senders are in Senders
          </Link>
          <Link href={`${basePath}/unsubscribed`} className={styles.inlineLink}>
            Outcomes are in Unsubscribed
          </Link>
        </div>
      </EmptyPanel>
    );
  }

  const notice = outcome ? (
    <OutcomeNotice
      outcome={outcome}
      basePath={basePath}
      working={working}
      onDismiss={() => setOutcome(null)}
      onUndoKeep={(items) => void undoKeep(items)}
    />
  ) : null;

  const busy = current ? unsubscribe.pending.has(current.id) || current.status === SENDER_STATUS.UNSUBSCRIBING : false;

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.crumb}>Cleanup</p>
        <div className={styles.head}>
          <div>
            <h1 className={styles.title}>
              Cleanup, <span className={styles.accent}>your way.</span>
            </h1>
            <p className={styles.lede}>Review your subscriptions. Keep what matters. Leave the rest.</p>
          </div>
          {accountConnected === false ? null : <ScanControl scan={scan} />}
        </div>
      </header>

      {accountConnected === false ? (
        <div className={styles.connect}>
          <EmptyPanel
            title="Connect Gmail to find your subscriptions"
            body="Tidely reads message headers to find mailing lists. You’ll see exactly what Google asks you to approve before anything is connected."
          >
            <Link href="/connect" className={`${buttons.primary} ${buttons.small}`}>
              Connect Gmail
              <ArrowUpRight size={17} strokeWidth={2} aria-hidden />
            </Link>
          </EmptyPanel>
        </div>
      ) : (
        <div className={styles.workspace} data-checking={checked.size > 0 || undefined}>
          <div className={styles.toolbar} role="search">
            <div className={styles.searchField}>
              <Search className={styles.fieldIcon} size={18} strokeWidth={1.75} aria-hidden />
              <label className="srOnly" htmlFor="cleanup-search">
                Search by sender or email address
              </label>
              <input
                id="cleanup-search"
                type="search"
                className={styles.search}
                placeholder="Search by sender or email address"
                autoComplete="off"
                value={senders.search}
                onChange={(event) => onSearch(event.target.value)}
              />
            </div>
            <div className={styles.sortField}>
              <ArrowDownWideNarrow className={styles.fieldIcon} size={18} strokeWidth={1.75} aria-hidden />
              <label className="srOnly" htmlFor="cleanup-sort">
                Sort senders
              </label>
              <select
                id="cleanup-sort"
                className={styles.sort}
                value={senders.sort}
                onChange={(event) => onSort(event.target.value as SenderSort)}
              >
                <option value="count">Most emails</option>
                <option value="recent">Most recent</option>
                <option value="name">Name A–Z</option>
              </select>
              <ChevronDown className={styles.chevron} size={16} strokeWidth={1.75} aria-hidden />
            </div>
          </div>

          <p className={styles.sideLabel} aria-hidden="true">
            Sender details
          </p>

          <div className={styles.status}>
            {checked.size > 0 ? (
              <div className={styles.bulk} role="region" aria-label="Selected senders">
                {confirming ? (
                  <>
                    <p className={styles.bulkText}>
                      Unsubscribe {checkedUnsubscribable}{" "}
                      {checkedUnsubscribable === 1 ? "sender" : "senders"}?{" "}
                      {demo
                        ? "In the demo nothing is sent — outcomes are simulated."
                        : "This sends real requests on your behalf."}
                      {checkedUnsubscribable < checked.size
                        ? ` ${checked.size - checkedUnsubscribable} without an unsubscribe method will be skipped.`
                        : ""}
                    </p>
                    <div className={styles.bulkActions}>
                      <button
                        key="cancel"
                        ref={cancelRef}
                        type="button"
                        className={`${buttons.quiet} ${buttons.small}`}
                        onClick={() => {
                          setConfirming(false);
                          requestAnimationFrame(() => askRef.current?.focus());
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        key="confirm"
                        type="button"
                        className={`${buttons.primary} ${buttons.small}`}
                        disabled={working}
                        onClick={() => {
                          // A double press on "Unsubscribe selected" must not
                          // land here and skip the question.
                          if (Date.now() - confirmShownAt.current < 400) return;
                          void runUnsubscribe([...checked]);
                        }}
                      >
                        Yes, unsubscribe {checkedUnsubscribable}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className={styles.bulkText}>
                      <strong>{checked.size}</strong> selected
                      <span className={styles.bulkScope}> on this page</span>
                    </p>
                    <div className={styles.bulkActions}>
                      <button
                        key="keep"
                        type="button"
                        className={`${buttons.secondary} ${buttons.small}`}
                        disabled={working}
                        onClick={() => void keep([...checked])}
                      >
                        Keep selected
                      </button>
                      <button
                        key="ask"
                        ref={askRef}
                        type="button"
                        className={`${buttons.primary} ${buttons.small}`}
                        disabled={working || checkedUnsubscribable === 0}
                        title={
                          checkedUnsubscribable === 0
                            ? "None of the selected senders publish an unsubscribe method."
                            : undefined
                        }
                        onClick={() => setConfirming(true)}
                      >
                        Unsubscribe selected
                      </button>
                    </div>
                    <button
                      type="button"
                      className={styles.clear}
                      onClick={() => {
                        setChecked(new Set());
                        // The bar is about to go; keep focus in the list.
                        document.getElementById("cleanup-select-page")?.focus();
                      }}
                      aria-label="Clear selection"
                      title="Clear selection"
                    >
                      <X size={17} strokeWidth={1.9} aria-hidden />
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.countRow}>
                <p className={styles.count}>
                  {firstLoad ? (
                    <span className={styles.countLoading}>Loading…</span>
                  ) : (
                    <>
                      {senders.counts.ACTIVE.toLocaleString("en")} to review
                    </>
                  )}
                </p>
                <p className={styles.hint}>
                  {searching && !senders.loading
                    ? `${senders.total.toLocaleString("en")} ${senders.total === 1 ? "match" : "matches"}`
                    : list.length
                      ? "Click a sender to review"
                      : ""}
                </p>
              </div>
            )}
          </div>

          <div className={styles.listArea}>
            <div className={styles.notice} role="status" aria-live="polite">
              {sheetVisible ? null : notice}
            </div>

            {senders.error && list.length > 0 ? (
              <p className={styles.error} role="alert">
                <CircleAlert size={16} strokeWidth={2} aria-hidden />
                {senders.error}
              </p>
            ) : null}

            <SenderTable
              senders={list}
              loading={senders.loading}
              activeId={current?.id ?? null}
              checked={checked}
              pending={unsubscribe.pending}
              locked={working}
              page={senders.page}
              pageCount={senders.pageCount}
              pageSize={PAGE_SIZE}
              total={senders.total}
              empty={empty}
              onActivate={activate}
              onToggle={toggle}
              onTogglePage={togglePage}
              onPage={goToPage}
            />

            {list.length > 1 && checked.size === 0 ? (
              <p className={styles.tip}>
                <SquareCheck size={17} strokeWidth={1.75} aria-hidden />
                Select multiple senders to keep or unsubscribe together.
              </p>
            ) : null}
          </div>

          <div className={styles.side}>
            <SenderDetails
              ref={backRef}
              sender={current}
              loading={senders.loading}
              busy={busy}
              locked={working}
              demo={demo}
              sheet={sheetMode}
              open={sheetVisible}
              position={current && activeIndex >= 0 ? { index: senders.page * PAGE_SIZE + activeIndex, total: senders.total } : null}
              notice={sheetVisible ? <div role="status" aria-live="polite">{notice}</div> : null}
              onBack={closeSheet}
              onKeep={() => current && void keep([current.id])}
              onUnsubscribe={() => current && void runUnsubscribe([current.id])}
            />
          </div>
        </div>
      )}

      <footer className={styles.foot}>
        <p>Your inbox. Your choice.</p>
        <Link href={`${basePath}/unsubscribed`} className={styles.footLink}>
          Past outcomes live in Unsubscribed
          <ArrowUpRight size={16} strokeWidth={1.9} aria-hidden />
        </Link>
      </footer>

      <p className="srOnly" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function EmptyPanel({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <h2 className={styles.emptyTitle}>{title}</h2>
      <p className={styles.emptyBody}>{body}</p>
      {children ? <div className={styles.emptyAction}>{children}</div> : null}
    </div>
  );
}
