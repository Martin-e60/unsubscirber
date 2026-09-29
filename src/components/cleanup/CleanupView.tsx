"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownWideNarrow,
  ArrowUpRight,
  ChevronDown,
  CircleAlert,
  Heart,
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
import {
  cleanupHref,
  cleanupView,
  unconfirmedStatus,
  type CleanupView as View,
  type UnconfirmedStatus,
} from "@/lib/navigation";
import type { SenderDto, SenderSort } from "@/lib/api/types";
import { ScanControl } from "./ScanControl";
import { SenderTable } from "./SenderTable";
import { SenderDetails } from "./SenderDetails";
import { OutcomeNotice, type Outcome } from "./OutcomeNotice";
import { ReviewCard } from "./ReviewCard";
import buttons from "./buttons.module.css";
import styles from "./CleanupView.module.css";

/**
 * Cleanup: deciding about senders, and changing your mind.
 *
 * Two views share one layout, switched at the top and kept in the URL:
 *
 *   To review   senders waiting for a decision — keep or unsubscribe, one at
 *               a time or several at once. Unsubscribes that still need
 *               something (a click, a retry, a request awaiting an answer)
 *               are filters here, so none of them are lost.
 *   Keeping     senders you chose to keep. Moving one back to review only
 *               changes that decision; it never unsubscribes or sends.
 *
 * Each view keeps its own search, sort, page and open sender, so switching
 * back and forth loses nothing. Confirmed unsubscribes live in Unsubscribed.
 *
 * Used by the signed-in app and by the demo alike. In the demo the API client
 * answers from sample data in the browser, so nothing here can reach Gmail.
 */

const PAGE_SIZE = 8;

/** Wide enough for the list and the details side by side. Mirrors the CSS. */
const SIDE_BY_SIDE = "(min-width: 75rem)";

const FOLLOW_UP: Record<UnconfirmedStatus, { label: string; empty: string }> = {
  MANUAL: {
    label: "Needs a click",
    empty: "Nothing needs a click right now",
  },
  FAILED: {
    label: "Failed",
    empty: "No failed attempts",
  },
  REQUESTED: {
    label: "Request sent",
    empty: "No requests waiting for an answer",
  },
};

function nameOf(sender: SenderDto): string {
  return sender.name ?? sender.address;
}

function without(set: Set<string>, ids: Iterable<string>): Set<string> {
  const next = new Set(set);
  for (const id of ids) next.delete(id);
  return next;
}

/**
 * Which sender is open in one view.
 *
 * When the open sender leaves the list — decided, filtered out, or on another
 * page — the one now in its place opens instead, so a run of decisions moves
 * down the list without extra clicks. `hold` asks for a particular sender that
 * is still on its way (e.g. after "View"), without being overridden meanwhile.
 */
function useOpenSender(list: SenderDto[], announce: (text: string) => void) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastIndex = useRef(0);
  const held = useRef<string | null>(null);

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
      if (held.current === activeId) held.current = null;
      return;
    }
    if (held.current && held.current === activeId) return;
    if (!current) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (activeId !== null) announce(`Now showing ${nameOf(current)}.`);
    setActiveId(current.id);
  }, [activeIndex, activeId, current, announce]);

  const open = useCallback((id: string) => {
    held.current = null;
    setActiveId(id);
  }, []);

  const hold = useCallback((id: string) => {
    held.current = id;
    setActiveId(id);
  }, []);

  const reset = useCallback(() => {
    held.current = null;
    lastIndex.current = 0;
    setActiveId(null);
  }, []);

  return { current, activeIndex, open, hold, reset, lastIndex };
}

export function CleanupView() {
  const { refreshStats, demo, basePath, accountConnected } = useApp();

  /* --- Where we are: all of it lives in the URL --------------------------------
     /cleanup · /cleanup?status=MANUAL · /cleanup?view=keeping — so any view can
     be linked to, and Back and Forward move between them. */

  const params = useSearchParams();
  const view = cleanupView(params.get("view"));
  const followUp = view === "review" ? unconfirmedStatus(params.get("status")) : null;
  const reviewing = params.get("review");
  const initialSearch = params.get("search") ?? "";

  const navigate = useCallback(
    (next: { view: View; status?: UnconfirmedStatus | null }, mode: "push" | "replace" = "push") => {
      const url = cleanupHref(basePath, { view: next.view, status: next.status ?? null });
      if (mode === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [basePath],
  );

  const [announcement, setAnnouncement] = useState("");

  const review = useSenders({
    initialStatus: followUp ?? SENDER_STATUS.ACTIVE,
    initialSearch: view === "review" ? initialSearch : "",
    pageSize: PAGE_SIZE,
  });
  const kept = useSenders({
    initialStatus: SENDER_STATUS.KEPT,
    initialSearch: view === "keeping" ? initialSearch : "",
    pageSize: PAGE_SIZE,
  });

  // Back and Forward change the follow-up filter through the URL.
  const { setStatus: setReviewStatus } = review;
  useEffect(() => {
    setReviewStatus(followUp ?? SENDER_STATUS.ACTIVE);
  }, [followUp, setReviewStatus]);

  const reviewOpen = useOpenSender(review.senders, view === "review" ? setAnnouncement : noop);
  const keptOpen = useOpenSender(kept.senders, view === "keeping" ? setAnnouncement : noop);

  const data = view === "keeping" ? kept : review;
  const openSender = view === "keeping" ? keptOpen : reviewOpen;
  const list = data.senders;
  const current = openSender.current;

  const sideBySide = useMediaQuery(SIDE_BY_SIDE);
  const sheetMode = sideBySide === false;

  const scan = useScan({
    // Opening Cleanup never scans. An unfinished scan is shown as unfinished.
    resume: false,
    onFinished: () => {
      void review.refresh();
      void kept.refresh();
      void refreshStats();
    },
  });

  const unsubscribe = useUnsubscribe({
    onResult: (id, patch) => review.patchSender(id, patch),
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [moving, setMoving] = useState(false);
  // A notice belongs to the view it happened in.
  const [outcome, setOutcome] = useState<{ view: View; value: Outcome } | null>(null);

  // A ref as well as state: a double press must not start two decisions.
  const acting = useRef(false);
  const working = keeping || moving || unsubscribe.running;

  const backRef = useRef<HTMLButtonElement>(null);
  const tabRefs = { review: useRef<HTMLButtonElement>(null), keeping: useRef<HTMLButtonElement>(null) };

  /* --- Switching views ------------------------------------------------------------
     Bulk selection belongs to To review and is cleared on leaving it, so a
     hidden sender can never be acted on. The details sheet closes too. */

  useEffect(() => {
    setChecked(new Set());
    setConfirming(false);
    setSheetOpen(false);
  }, [view, followUp]);

  // A notice about one list does not follow you into a different filter.
  useEffect(() => {
    setOutcome((current) => (current?.view === "review" ? null : current));
  }, [followUp]);

  const switchView = (next: View) => {
    if (next === view) return;
    navigate({ view: next });
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next: View =
      event.key === "Home" ? "review" : event.key === "End" ? "keeping" : view === "review" ? "keeping" : "review";
    switchView(next);
    tabRefs[next].current?.focus();
  };

  /* --- Bulk selection (To review only) ------------------------------------------ */

  // Ticked senders that are no longer on screen are unticked, so a bulk
  // action can never reach a sender you cannot see.
  useEffect(() => {
    setChecked((previous) => {
      if (previous.size === 0) return previous;
      const visible = new Set(review.senders.map((sender) => sender.id));
      const next = new Set([...previous].filter((id) => visible.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [review.senders]);

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
    window.setTimeout(() => {
      if (!id) return;
      document.querySelector<HTMLButtonElement>(`[data-sender-id="${CSS.escape(id)}"]`)?.focus();
    }, 0);
  }, [current?.id]);

  useEffect(() => {
    if (!sheetMode || !current) setSheetOpen(false);
  }, [sheetMode, current]);

  const sheetVisible = sheetMode && sheetOpen && current !== null;

  // Escape closes; the ref keeps the listener from being re-attached (and
  // focus from jumping) every time a decision opens the next sender.
  const closeSheetRef = useRef(closeSheet);
  closeSheetRef.current = closeSheet;

  useEffect(() => {
    if (!sheetVisible) return;
    // Focus moves in once, when the sheet opens.
    backRef.current?.focus();

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeSheetRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [sheetVisible]);

  const activate = (id: string, open: boolean) => {
    openSender.open(id);
    if (open && sheetMode) setSheetOpen(true);
  };

  /**
   * After a decision, focus returns to the control that made it — buttons are
   * disabled while saving, which drops focus — or, if that control is gone
   * (say the last kept sender moved), to the current view's tab.
   */
  const keepFocus = (origin: Element | null) =>
    // After the state updates have rendered, not before.
    window.setTimeout(() => {
      const usable = (el: Element | null): el is HTMLElement =>
        el instanceof HTMLElement &&
        el !== document.body &&
        el.isConnected &&
        !el.hasAttribute("disabled") &&
        el.offsetParent !== null;
      if (usable(document.activeElement)) return;
      if (usable(origin)) origin.focus();
      else tabRefs[view].current?.focus();
    }, 60);

  /* --- Decisions -------------------------------------------------------------- */

  const afterDecision = async () => {
    await Promise.all([review.refresh(), kept.refresh()]);
    void refreshStats();
  };

  const keep = async (ids: string[]) => {
    const targets = review.senders.filter((sender) => ids.includes(sender.id));
    if (acting.current || targets.length === 0) return;
    const origin = document.activeElement;
    acting.current = true;
    setKeeping(true);
    setOutcome(null);

    try {
      const results = await Promise.all(targets.map((sender) => review.keepSender(sender.id)));
      const keptSenders = targets
        .filter((_, index) => results[index])
        .map((sender) => ({ id: sender.id, name: nameOf(sender) }));
      const failed = targets.filter((_, index) => !results[index]).map(nameOf);

      // The notice explains any failure, so the list's generic error is not
      // repeated beside it.
      if (failed.length) review.clearError();
      setOutcome({ view: "review", value: { kind: "keep", kept: keptSenders, failed } });
      setChecked((previous) => without(previous, ids));
      await afterDecision();
      keepFocus(origin);
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
      const results = await Promise.all(items.map((item) => review.restoreSender(item.id)));
      const restored = items.filter((_, index) => results[index]);
      if (restored.length !== items.length) review.clearError();
      setOutcome({
        view: "review",
        value: {
          kind: "restored",
          names: restored.map((item) => item.name),
          failed: items.filter((_, index) => !results[index]).map((item) => item.name),
        },
      });
      await afterDecision();
      // Reopen what came back, now that the refreshed list contains it.
      if (restored[0]) reviewOpen.open(restored[0].id);
    } finally {
      acting.current = false;
      setKeeping(false);
    }
  };

  const runUnsubscribe = async (ids: string[]) => {
    const targets = review.senders.filter((sender) => ids.includes(sender.id));
    if (acting.current || targets.length === 0) return;
    const origin = document.activeElement;
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
        view: "review",
        value: {
          kind: "unsubscribe",
          items: results.map((result) => ({
            name: names.get(result.senderId) ?? "This sender",
            result,
          })),
          skipped,
        },
      });
      setChecked((previous) => without(previous, ids));
      await afterDecision();
      keepFocus(origin);
    } finally {
      acting.current = false;
    }
  };

  /**
   * Keeping → To review. A decision change only: nothing is unsubscribed,
   * nothing is sent, nothing in the mailbox is touched.
   */
  const moveToReview = async (sender: SenderDto) => {
    if (acting.current) return;
    const origin = document.activeElement;
    acting.current = true;
    setMoving(true);
    setOutcome(null);

    try {
      const ok = await kept.restoreSender(sender.id);
      if (!ok) kept.clearError();
      setOutcome({
        view: "keeping",
        value: ok
          ? { kind: "moved", id: sender.id, name: nameOf(sender) }
          : { kind: "moveFailed", name: nameOf(sender) },
      });
      await afterDecision();
      keepFocus(origin);
    } finally {
      acting.current = false;
      setMoving(false);
    }
  };

  /** "View" on the moved notice: open that sender in To review. */
  const viewMoved = (id: string, name: string) => {
    setOutcome(null);
    navigate({ view: "review" });
    review.setSearch(name);
    reviewOpen.hold(id);
  };

  /* --- Selection ------------------------------------------------------------------ */

  const selectable = (sender: SenderDto) => sender.status !== SENDER_STATUS.REQUESTED;

  const toggle = (id: string) =>
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = () => {
    const ids = review.senders
      .filter((sender) => !unsubscribe.pending.has(sender.id) && selectable(sender))
      .map((sender) => sender.id);
    setChecked((previous) =>
      ids.every((id) => previous.has(id)) ? without(previous, ids) : new Set([...previous, ...ids]),
    );
  };

  const checkedSenders = review.senders.filter((sender) => checked.has(sender.id));
  const checkedUnsubscribable = checkedSenders.filter((sender) => sender.canUnsubscribe).length;

  /* --- Paging, search and sort ------------------------------------------------- */

  const goToPage = (page: number) => {
    openSender.reset();
    data.setPage(page);
  };

  const onSearch = (value: string) => {
    openSender.lastIndex.current = 0;
    data.setSearch(value);
  };

  const onSort = (value: SenderSort) => {
    openSender.lastIndex.current = 0;
    data.setSort(value);
  };

  /* --- Counts ------------------------------------------------------------------ */

  const loaded = (hook: typeof review) => !(hook.loading && hook.senders.length === 0 && hook.total === 0);
  const reviewCount = loaded(review) ? review.counts.ACTIVE : null;
  const keptCount = loaded(kept) ? kept.counts.KEPT : null;
  const followUps = (["MANUAL", "FAILED", "REQUESTED"] as const).map((status) => ({
    status,
    count: review.counts[status],
  }));
  const showFollowUps =
    view === "review" && (followUp !== null || followUps.some((item) => item.count > 0));

  /* --- Empty states ---------------------------------------------------------------- */

  // What the rows on screen were actually filtered by, not what is still
  // being typed.
  const appliedSearch = data.appliedSearch.trim();
  const searching = appliedSearch.length > 0;
  const firstLoad = !loaded(data);

  let empty: ReactNode;
  if (data.error) {
    empty = (
      <EmptyPanel title="Couldn’t load your senders" body={data.error}>
        <button type="button" className={`${buttons.secondary} ${buttons.small}`} onClick={() => void data.refresh()}>
          Try again
        </button>
      </EmptyPanel>
    );
  } else if (searching) {
    empty = (
      <EmptyPanel
        title={view === "keeping" ? `No kept senders match “${appliedSearch}”` : `No senders match “${appliedSearch}”`}
        body={
          view === "keeping"
            ? "Search looks at the names and email addresses of senders you’re keeping."
            : "Search looks at sender names and email addresses among the senders waiting for review."
        }
      >
        <button type="button" className={`${buttons.secondary} ${buttons.small}`} onClick={() => onSearch("")}>
          Clear search
        </button>
      </EmptyPanel>
    );
  } else if (view === "keeping") {
    empty = (
      <EmptyPanel
        title="No kept senders yet"
        body="Senders appear here after you choose Keep in To review. You can move them back anytime."
      >
        <button type="button" className={`${buttons.secondary} ${buttons.small}`} onClick={() => switchView("review")}>
          Go to To review
        </button>
      </EmptyPanel>
    );
  } else if (followUp) {
    empty = (
      <EmptyPanel title={FOLLOW_UP[followUp].empty} body="Nothing in this list needs anything from you.">
        <button
          type="button"
          className={`${buttons.secondary} ${buttons.small}`}
          onClick={() => navigate({ view: "review" })}
        >
          Show senders waiting for a decision
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
          <button type="button" className={styles.inlineLink} onClick={() => switchView("keeping")}>
            See the senders you’re keeping
          </button>
          <Link href={`${basePath}/unsubscribed`} className={styles.inlineLink}>
            Outcomes are in Unsubscribed
          </Link>
        </div>
      </EmptyPanel>
    );
  }

  const shownOutcome = outcome && outcome.view === view ? outcome.value : null;
  const notice = shownOutcome ? (
    <OutcomeNotice
      outcome={shownOutcome}
      basePath={basePath}
      working={working}
      onDismiss={() => setOutcome(null)}
      onUndoKeep={(items) => void undoKeep(items)}
      onView={viewMoved}
    />
  ) : null;

  const busy =
    view === "review" && current
      ? unsubscribe.pending.has(current.id) || current.status === SENDER_STATUS.UNSUBSCRIBING
      : false;

  // Shown only when there are no filters to carry the count.
  const countLabel =
    view === "keeping"
      ? `${(keptCount ?? 0).toLocaleString("en")} keeping`
      : `${(reviewCount ?? 0).toLocaleString("en")} to review`;

  const bulkOn = view === "review" && checked.size > 0;

  // The To review filters. They carry their own counts, so no separate count
  // label repeats the active filter beside them.
  const filters = showFollowUps ? (
    <div className={styles.filters} role="group" aria-label="Show in To review">
      <button
        type="button"
        className={styles.filter}
        aria-pressed={followUp === null}
        onClick={() => navigate({ view: "review" })}
      >
        Waiting for a decision
        <span className={styles.filterCount}>{(reviewCount ?? 0).toLocaleString("en")}</span>
      </button>
      {followUps
        .filter((item) => item.count > 0 || item.status === followUp)
        .map((item) => (
          <button
            key={item.status}
            type="button"
            className={styles.filter}
            aria-pressed={followUp === item.status}
            onClick={() => navigate({ view: "review", status: item.status })}
          >
            {FOLLOW_UP[item.status].label}
            <span className={styles.filterCount}>{item.count.toLocaleString("en")}</span>
          </button>
        ))}
    </div>
  ) : null;

  return (
    <div className={styles.page}>
      <header>
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

      {reviewing && accountConnected !== false ? (
        <ReviewCard
          senderId={reviewing}
          basePath={basePath}
          demo={demo}
          onClose={() => navigate({ view, status: followUp }, "replace")}
        />
      ) : null}

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
        <>
          <div className={styles.views}>
            <div className={styles.switch} role="tablist" aria-label="Cleanup views">
              {(["review", "keeping"] as const).map((id) => {
                const selected = view === id;
                const count = id === "review" ? reviewCount : keptCount;
                return (
                  <button
                    key={id}
                    ref={tabRefs[id]}
                    type="button"
                    role="tab"
                    id={`cleanup-tab-${id}`}
                    aria-selected={selected}
                    aria-controls="cleanup-panel"
                    tabIndex={selected ? 0 : -1}
                    className={styles.tab}
                    data-selected={selected || undefined}
                    onClick={() => switchView(id)}
                    onKeyDown={onTabKey}
                  >
                    {id === "keeping" ? <Heart size={17} strokeWidth={1.9} aria-hidden /> : null}
                    {id === "review" ? "To review" : "Keeping"}
                    <span className={styles.tabCount}>{count === null ? "" : count.toLocaleString("en")}</span>
                  </button>
                );
              })}
            </div>
            {/* To review needs no line here: the tab and filters already say it. */}
            {view === "keeping" ? (
              <p className={styles.context}>
                Senders you’ve chosen to keep. You can change your mind anytime.
              </p>
            ) : null}
          </div>

          <div
            className={styles.workspace}
            data-checking={bulkOn || undefined}
            id="cleanup-panel"
            role="tabpanel"
            aria-labelledby={`cleanup-tab-${view}`}
          >
            <div className={styles.toolbar} role="search">
              <div className={styles.searchField}>
                <Search className={styles.fieldIcon} size={18} strokeWidth={1.75} aria-hidden />
                <label className="srOnly" htmlFor="cleanup-search">
                  {view === "keeping" ? "Search kept senders" : "Search by sender or email address"}
                </label>
                <input
                  id="cleanup-search"
                  type="search"
                  className={styles.search}
                  placeholder={view === "keeping" ? "Search kept senders" : "Search by sender or email address"}
                  autoComplete="off"
                  value={data.search}
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
                  value={data.sort}
                  onChange={(event) => onSort(event.target.value as SenderSort)}
                >
                  <option value="count">Most emails</option>
                  <option value="recent">Most recent</option>
                  <option value="name">Name A–Z</option>
                </select>
                <ChevronDown className={styles.chevron} size={16} strokeWidth={1.75} aria-hidden />
              </div>
            </div>

            <div className={styles.status}>
              {bulkOn ? filters : null}
              {bulkOn ? (
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
                            window.setTimeout(() => askRef.current?.focus(), 0);
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
                  {filters ?? (
                    <p className={styles.count}>
                      {firstLoad ? <span className={styles.countLoading}>Loading…</span> : countLabel}
                    </p>
                  )}
                  <p className={styles.hint}>
                    {searching && !data.loading
                      ? `${data.total.toLocaleString("en")} ${data.total === 1 ? "match" : "matches"}`
                      : view === "review" && list.length && !filters
                        ? "Click a sender to review"
                        : ""}
                  </p>
                </div>
              )}

              {/* Notices sit above the list, not inside its column, so the list
                  and the details card always start level. */}
              <div className={styles.notice} role="status" aria-live="polite">
                {sheetVisible ? null : notice}
              </div>

              {data.error && list.length > 0 ? (
                <p className={styles.error} role="alert">
                  <CircleAlert size={16} strokeWidth={2} aria-hidden />
                  {data.error}
                </p>
              ) : null}
            </div>

            <div className={styles.listArea}>

              <SenderTable
                key={view}
                senders={list}
                loading={data.loading}
                activeId={current?.id ?? null}
                checked={checked}
                pending={unsubscribe.pending}
                locked={working}
                page={data.page}
                pageCount={data.pageCount}
                pageSize={PAGE_SIZE}
                total={data.total}
                empty={empty}
                onActivate={activate}
                onToggle={toggle}
                onTogglePage={togglePage}
                onPage={goToPage}
                selectable={view === "review"}
                canCheck={selectable}
                listLabel={view === "keeping" ? "Kept senders" : "Senders to review"}
                noun={view === "keeping" ? { one: "kept sender", many: "kept senders" } : undefined}
                plainTotal={view === "keeping"}
              />

              {view === "keeping" ? (
                <p className={styles.tip}>
                  <Heart size={17} strokeWidth={1.75} aria-hidden />
                  Kept senders stay here when you scan again.
                </p>
              ) : list.length > 1 && checked.size === 0 && !followUp ? (
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
                loading={data.loading}
                busy={busy}
                locked={working}
                demo={demo}
                sheet={sheetMode}
                open={sheetVisible}
                position={
                  current && openSender.activeIndex >= 0
                    ? { index: data.page * PAGE_SIZE + openSender.activeIndex, total: data.total }
                    : null
                }
                notice={sheetVisible ? <div role="status" aria-live="polite">{notice}</div> : null}
                mode={view}
                basePath={basePath}
                moving={moving}
                onBack={closeSheet}
                onKeep={() => current && void keep([current.id])}
                onUnsubscribe={() => current && void runUnsubscribe([current.id])}
                onMoveToReview={() => current && void moveToReview(current)}
              />
            </div>
          </div>
        </>
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

function noop() {}

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
