"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, History } from "lucide-react";
import { useApp } from "@/components/layout/AppShell";
import { MailboxSwitcher } from "@/components/layout/MailboxSwitcher";
import { HistorySheet } from "@/components/clearout/Panels";
import { useClearOutHistory } from "@/hooks/useClearOut";
import { useScan } from "@/hooks/useScan";
import { useSenders } from "@/hooks/useSenders";
import { useUnsubscribe } from "@/hooks/useUnsubscribe";
import { useApi } from "@/lib/api/context";
import { DEFAULT_LOOKBACK_DAYS, SENDER_STATUS } from "@/lib/constants";
import { parseFilter, type ClearOutFilter } from "@/lib/clearout/filters";
import {
  cleanupHref,
  cleanupView,
  senderPlace,
  unconfirmedStatus,
  type CleanupView as View,
  type UnconfirmedStatus,
} from "@/lib/navigation";
import type { SenderDto, SenderSort, SendersResponse } from "@/lib/api/types";
import glass from "@/components/home/glass.module.css";
import { EmptyPanel } from "./EmptyPanel";
import { ACCESS_MESSAGES, MessagePane, type MessageTarget } from "./MessagePane";
import { OutcomeNotice, type Outcome } from "./OutcomeNotice";
import { ReviewCard } from "./ReviewCard";
import { ScanControl } from "./ScanControl";
import { SenderBulkBar, FOLLOW_UP, SenderPane } from "./SenderPane";
import { SenderHeader } from "./SenderHeader";
import styles from "./CleanupView.module.css";

/**
 * Cleanup: one workspace for deciding about senders and organising their mail.
 *
 * The left pane is the senders; the right pane is whoever is focused there —
 * their subscription (Keep, Unsubscribe) in a header, and their messages
 * below it. "All emails" shows the whole mailbox instead, personal mail
 * included, with no subscription actions because there is no subscription.
 *
 * Two things stay apart on purpose. Subscription decisions never touch a
 * message: Keep and Unsubscribe do not archive, trash, label or mark anything.
 * And selections are independent: the senders ticked on the left and the
 * messages ticked on the right are separate, and a message selection never
 * follows you to another sender or another filter.
 *
 * Two lists share the left pane, switched at the top and kept in the URL:
 *
 *   To review   senders waiting for a decision. Unsubscribes that still need
 *               something (a click, a retry, a request awaiting an answer)
 *               are filters here, so none of them are lost.
 *   Keeping     senders you chose to keep. Moving one back to review only
 *               changes that decision; it never unsubscribes or sends.
 *
 * Each list keeps its own search, sort, page and open sender, so switching
 * back and forth loses nothing. Confirmed unsubscribes live in Unsubscribed.
 *
 * Used by the signed-in app and by the demo alike. In the demo the API client
 * answers from sample data in the browser, so nothing here can reach Gmail.
 */

const PAGE_SIZE = 8;

/** Below this the two panes stack, and choosing a sender scrolls to their mail. */
const STACKED = "(max-width: 63.99rem)";

function nameOf(sender: SenderDto): string {
  return sender.name ?? sender.address;
}

function without(set: Set<string>, ids: Iterable<string>): Set<string> {
  const next = new Set(set);
  for (const id of ids) next.delete(id);
  return next;
}

/**
 * Which sender is open in one list.
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

type UrlState = {
  view: View;
  status: UnconfirmedStatus | null;
  all: boolean;
  review: string | null;
  filter: ClearOutFilter;
};

export function CleanupView() {
  const { refreshStats, demo, basePath, accountConnected } = useApp();
  const api = useApi();

  /* --- Where we are: all of it lives in the URL --------------------------------
     /cleanup · ?status=MANUAL · ?view=keeping · ?mail=all, plus the message
     filters (?unread=1&older=6m …) — so any state can be linked to, and Back
     and Forward move between them. */

  const params = useSearchParams();
  const view = cleanupView(params.get("view"));
  const followUp = view === "review" ? unconfirmedStatus(params.get("status")) : null;
  const reviewing = params.get("review");
  const showAll = params.get("mail") === "all";
  const initialSearch = params.get("search") ?? "";
  const accessParam = params.get("access");
  const filter = useMemo(() => parseFilter(new URLSearchParams(params.toString())), [params]);

  const urlRef = useRef<UrlState>({ view, status: followUp, all: showAll, review: reviewing, filter });
  urlRef.current = { view, status: followUp, all: showAll, review: reviewing, filter };

  const go = useCallback(
    (patch: Partial<UrlState>, mode: "push" | "replace" = "push") => {
      const next = { ...urlRef.current, ...patch };
      urlRef.current = next;
      const url = cleanupHref(basePath, {
        view: next.view,
        status: next.status,
        all: next.all,
        review: next.review,
        filter: next.filter,
      });
      if (mode === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [basePath],
  );

  const onFilter = useCallback(
    (next: ClearOutFilter, mode: "push" | "replace" = "push") => go({ filter: next }, mode),
    [go],
  );

  const [announcement, setAnnouncement] = useState("");

  const reviewList = useSenders({
    initialStatus: followUp ?? SENDER_STATUS.ACTIVE,
    initialSearch: view === "review" ? initialSearch : "",
    pageSize: PAGE_SIZE,
  });
  const keptList = useSenders({
    initialStatus: SENDER_STATUS.KEPT,
    initialSearch: view === "keeping" ? initialSearch : "",
    pageSize: PAGE_SIZE,
  });

  // Back and Forward change the follow-up filter through the URL.
  const { setStatus: setReviewStatus } = reviewList;
  useEffect(() => {
    setReviewStatus(followUp ?? SENDER_STATUS.ACTIVE);
  }, [followUp, setReviewStatus]);

  // "Now showing …" is only true while a sender, not All emails, is what's showing.
  const reviewOpen = useOpenSender(reviewList.senders, view === "review" && !showAll ? setAnnouncement : noop);
  const keptOpen = useOpenSender(keptList.senders, view === "keeping" && !showAll ? setAnnouncement : noop);

  const data = view === "keeping" ? keptList : reviewList;
  const openSender = view === "keeping" ? keptOpen : reviewOpen;
  const list = data.senders;
  const current = openSender.current;

  const scan = useScan({
    // Opening Cleanup never scans. An unfinished scan is shown as unfinished.
    resume: false,
    onFinished: () => {
      void reviewList.refresh();
      void keptList.refresh();
      void refreshStats();
    },
  });

  const unsubscribe = useUnsubscribe({
    onResult: (id, patch) => reviewList.patchSender(id, patch),
  });

  const history = useClearOutHistory();
  const [historyOpen, setHistoryOpen] = useState(false);

  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [keeping, setKeeping] = useState(false);
  const [moving, setMoving] = useState(false);
  // A notice belongs to the list it happened in.
  const [outcome, setOutcome] = useState<{ view: View; value: Outcome } | null>(null);

  // A ref as well as state: a double press must not start two decisions.
  const acting = useRef(false);
  const working = keeping || moving || unsubscribe.running;

  const tabRefs = { review: useRef<HTMLButtonElement>(null), keeping: useRef<HTMLButtonElement>(null) };
  const detailRef = useRef<HTMLElement>(null);

  /* --- Opening a link to one sender -------------------------------------------------
     An old Clear out link names a sender by address (?from=…). If Cleanup knows
     that address it opens there — in the right list, with that sender focused.
     If not (a friend, a shop, someone already unsubscribed from), the whole
     mailbox opens filtered to that address instead. */

  const linkedAddress = !showAll && filter.senders.length === 1 ? filter.senders[0] : null;
  const [linking, setLinking] = useState(linkedAddress !== null);
  const lists = useRef({ reviewList, keptList, reviewOpen, keptOpen });
  lists.current = { reviewList, keptList, reviewOpen, keptOpen };

  useEffect(() => {
    if (linkedAddress === null) {
      setLinking(false);
      return;
    }
    let live = true;
    setLinking(true);
    api
      .get<SendersResponse>(`/api/senders?status=ALL&search=${encodeURIComponent(linkedAddress)}&limit=10`)
      .then((result) => {
        if (!live) return;
        const found = result.senders.find((sender) => sender.address.toLowerCase() === linkedAddress);
        const place = found ? senderPlace(found.status) : null;
        if (!found || !place) {
          go({ all: true }, "replace");
          return;
        }
        go(
          { view: place.view, status: place.status, all: false, filter: { ...urlRef.current.filter, senders: [] } },
          "replace",
        );
        const target = place.view === "keeping" ? lists.current.keptList : lists.current.reviewList;
        const opener = place.view === "keeping" ? lists.current.keptOpen : lists.current.reviewOpen;
        target.setSearch(found.address);
        opener.hold(found.id);
      })
      .catch(() => {
        if (live) go({ all: true }, "replace");
      })
      .finally(() => {
        if (live) setLinking(false);
      });
    return () => {
      live = false;
    };
  }, [api, go, linkedAddress]);

  /* --- The result of a permission trip to Google ----------------------------------------
     Shown once, then dropped from the URL. */

  const [accessNotice, setAccessNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!accessParam) return;
    setAccessNotice(ACCESS_MESSAGES[accessParam] ? accessParam : "failed");
    go({}, "replace");
  }, [accessParam, go]);

  /* --- Switching lists ------------------------------------------------------------------
     Bulk selection belongs to To review and is cleared on leaving it, so a
     hidden sender can never be acted on. */

  useEffect(() => {
    setChecked(new Set());
  }, [view, followUp]);

  // A notice about one list does not follow you into a different filter.
  useEffect(() => {
    setOutcome((existing) => (existing?.view === "review" ? null : existing));
  }, [followUp]);

  const switchView = (next: View) => {
    if (next === view) return;
    go({ view: next, status: null });
  };

  const changeFollowUp = (status: UnconfirmedStatus | null) => go({ view: "review", status });

  /* --- Bulk selection (To review only) ------------------------------------------------ */

  // Ticked senders that are no longer on screen are unticked, so a bulk
  // action can never reach a sender you cannot see.
  useEffect(() => {
    setChecked((previous) => {
      if (previous.size === 0) return previous;
      const visible = new Set(reviewList.senders.map((sender) => sender.id));
      const next = new Set([...previous].filter((id) => visible.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [reviewList.senders]);

  /* --- Choosing whose mail to show ------------------------------------------------------ */

  const scrollToMessages = () => {
    if (window.matchMedia(STACKED).matches) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const activate = (id: string, open: boolean) => {
    openSender.open(id);
    if (showAll) go({ all: false, filter: { ...urlRef.current.filter, senders: [] } }, "replace");
    if (open) scrollToMessages();
  };

  const openAll = () => {
    go({ all: true, filter: { ...urlRef.current.filter, senders: [] } }, "replace");
    scrollToMessages();
  };

  /**
   * After a decision, focus returns to the control that made it — buttons are
   * disabled while saving, which drops focus — or, if that control is gone
   * (say the last kept sender moved), to the current list's tab.
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

  /* --- Decisions: subscriptions only, never messages ----------------------------------- */

  const afterDecision = async () => {
    await Promise.all([reviewList.refresh(), keptList.refresh()]);
    void refreshStats();
  };

  const keep = async (ids: string[]) => {
    const targets = reviewList.senders.filter((sender) => ids.includes(sender.id));
    if (acting.current || targets.length === 0) return;
    const origin = document.activeElement;
    acting.current = true;
    setKeeping(true);
    setOutcome(null);

    try {
      const results = await Promise.all(targets.map((sender) => reviewList.keepSender(sender.id)));
      const keptSenders = targets
        .filter((_, index) => results[index])
        .map((sender) => ({ id: sender.id, name: nameOf(sender) }));
      const failed = targets.filter((_, index) => !results[index]).map(nameOf);

      // The notice explains any failure, so the list's generic error is not
      // repeated beside it.
      if (failed.length) reviewList.clearError();
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
      const results = await Promise.all(items.map((item) => reviewList.restoreSender(item.id)));
      const restored = items.filter((_, index) => results[index]);
      if (restored.length !== items.length) reviewList.clearError();
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
    const targets = reviewList.senders.filter((sender) => ids.includes(sender.id));
    if (acting.current || targets.length === 0) return;
    const origin = document.activeElement;
    acting.current = true;
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
      const ok = await keptList.restoreSender(sender.id);
      if (!ok) keptList.clearError();
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
    go({ view: "review", status: null, all: false });
    reviewList.setSearch(name);
    reviewOpen.hold(id);
  };

  /* --- Selection ------------------------------------------------------------------------ */

  const selectable = (sender: SenderDto) => sender.status !== SENDER_STATUS.REQUESTED;

  const toggle = (id: string) =>
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pageIds = reviewList.senders
    .filter((sender) => !unsubscribe.pending.has(sender.id) && selectable(sender))
    .map((sender) => sender.id);
  const pageAll = pageIds.length > 0 && pageIds.every((id) => checked.has(id));

  const selectPage = () => setChecked((previous) => new Set([...previous, ...pageIds]));

  const checkedSenders = reviewList.senders.filter((sender) => checked.has(sender.id));
  const checkedUnsubscribable = checkedSenders.filter((sender) => sender.canUnsubscribe).length;

  /* --- Paging, search and sort ----------------------------------------------------------- */

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

  /* --- Counts ---------------------------------------------------------------------------- */

  const loaded = (hook: typeof reviewList) => !(hook.loading && hook.senders.length === 0 && hook.total === 0);
  const reviewCount = loaded(reviewList) ? reviewList.counts.ACTIVE : null;
  const keptCount = loaded(keptList) ? keptList.counts.KEPT : null;
  const followUps = (["MANUAL", "FAILED", "REQUESTED"] as const).map((status) => ({
    status,
    count: reviewList.counts[status],
  }));

  /* --- Empty states ---------------------------------------------------------------------- */

  // What the rows on screen were actually filtered by, not what is still
  // being typed.
  const appliedSearch = data.appliedSearch.trim();
  const searching = appliedSearch.length > 0;
  const firstLoad = !loaded(data);

  const emptyButton = `${styles.emptyButton} ${glass.button}`;
  let empty: ReactNode;
  if (data.error) {
    empty = (
      <EmptyPanel title="Couldn’t load your senders" body={data.error}>
        <button type="button" className={emptyButton} onClick={() => void data.refresh()}>
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
        <button type="button" className={emptyButton} onClick={() => onSearch("")}>
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
        <button type="button" className={emptyButton} onClick={() => switchView("review")}>
          Go to To review
        </button>
      </EmptyPanel>
    );
  } else if (followUp) {
    empty = (
      <EmptyPanel title={FOLLOW_UP[followUp].empty} body="Nothing in this list needs anything from you.">
        <button type="button" className={emptyButton} onClick={() => changeFollowUp(null)}>
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
          className={`${styles.emptyButton} ${styles.emptyPrimary}`}
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

  /* --- What the message pane shows ------------------------------------------------------- */

  const sender = showAll ? null : current;
  const target: MessageTarget | null = showAll
    ? { kind: "all" }
    : sender && !linking
      ? { kind: "sender", address: sender.address, name: nameOf(sender) }
      : null;
  const pending = !showAll && (linking || (sender === null && firstLoad));

  const busy =
    view === "review" && sender
      ? unsubscribe.pending.has(sender.id) || sender.status === SENDER_STATUS.UNSUBSCRIBING
      : false;

  const bulk =
    view === "review" && checked.size > 0 ? (
      <SenderBulkBar
        key={[...checked].sort().join("|")}
        count={checked.size}
        unsubscribable={checkedUnsubscribable}
        pageAll={pageAll}
        working={working}
        demo={demo}
        onKeep={() => void keep([...checked])}
        onUnsubscribe={() => void runUnsubscribe([...checked])}
        onClear={() => {
          setChecked(new Set());
          window.setTimeout(() => document.getElementById("cleanup-sender-search")?.focus(), 0);
        }}
        onSelectPage={selectPage}
      />
    ) : null;

  return (
    <div className={styles.page}>
      {reviewing && accountConnected !== false ? (
        <ReviewCard
          senderId={reviewing}
          basePath={basePath}
          demo={demo}
          onClose={() => go({ review: null }, "replace")}
        />
      ) : null}

      <section className={`${styles.workspace} ${glass.card}`} aria-labelledby="cleanup-title">
        <div className={styles.head}>
          <h1 className={styles.title} id="cleanup-title">
            Cleanup
          </h1>
          {accountConnected === false ? null : (
            <ScanControl
              scan={scan}
              leading={<MailboxSwitcher placement="toolbar" />}
              trailing={
                <button
                  type="button"
                  className={`${styles.history} ${glass.button}`}
                  onClick={() => {
                    setHistoryOpen(true);
                    void history.refresh();
                  }}
                >
                  <History size={19} strokeWidth={1.6} aria-hidden />
                  History
                </button>
              }
            />
          )}
        </div>

        {accountConnected === false ? (
          <div className={styles.connect}>
            <EmptyPanel
              title="Connect Gmail to find your subscriptions"
              body="Tidely reads message headers to find mailing lists. You’ll see exactly what Google asks you to approve before anything is connected."
            >
              <Link href="/connect" className={`${styles.emptyButton} ${styles.emptyPrimary}`}>
                Connect Gmail
                <ArrowUpRight size={17} strokeWidth={2} aria-hidden />
              </Link>
            </EmptyPanel>
          </div>
        ) : (
          <>
            {/* Decisions are announced here, above both panes, so they are never
                lost behind whichever list or sender happens to be on screen. */}
            <div className={styles.notice} role="status" aria-live="polite">
              {notice}
            </div>

            {data.error && list.length > 0 ? (
              <p className={styles.error} role="alert">
                {data.error}
              </p>
            ) : null}

            <div className={styles.panes}>
              <div className={styles.paneSlot}>
                <SenderPane
                  view={view}
                  tabRefs={tabRefs}
                  reviewCount={reviewCount}
                  keptCount={keptCount}
                  onView={switchView}
                  followUp={followUp}
                  followUps={followUps}
                  onFollowUp={changeFollowUp}
                  search={data.search}
                  onSearch={onSearch}
                  sort={data.sort}
                  onSort={onSort}
                  searchLabel={view === "keeping" ? "Search kept senders" : "Find a sender by name or email address"}
                  bar={bulk}
                  allActive={showAll}
                  onAll={openAll}
                  senders={list}
                  loading={data.loading}
                  activeId={showAll ? null : (current?.id ?? null)}
                  checked={checked}
                  pending={unsubscribe.pending}
                  locked={working}
                  selectable={view === "review"}
                  canCheck={selectable}
                  page={data.page}
                  pageCount={data.pageCount}
                  pageSize={PAGE_SIZE}
                  total={data.total}
                  onPage={goToPage}
                  empty={empty}
                  onActivate={activate}
                  onToggle={toggle}
                />
              </div>

              <section className={`${styles.detail} ${glass.card} ${glass.pane}`} ref={detailRef} aria-labelledby="cleanup-subject">
                <SenderHeader
                  sender={sender}
                  all={showAll}
                  loading={pending}
                  mode={view}
                  busy={busy}
                  locked={working}
                  moving={moving}
                  demo={demo}
                  basePath={basePath}
                  onKeep={() => sender && void keep([sender.id])}
                  onUnsubscribe={() => sender && void runUnsubscribe([sender.id])}
                  onMoveToReview={() => sender && void moveToReview(sender)}
                />
                <div className={styles.rule} role="presentation" />
                <MessagePane
                  target={target}
                  pending={pending}
                  filter={filter}
                  onFilter={onFilter}
                  accessNotice={accessNotice}
                  onDismissAccessNotice={() => setAccessNotice(null)}
                  onBrowseAll={openAll}
                  onRunFinished={() => void history.refresh()}
                />
              </section>
            </div>
          </>
        )}
      </section>

      <HistorySheet
        open={historyOpen}
        runs={history.runs}
        error={history.error}
        demo={demo}
        basePath={basePath}
        onClose={() => setHistoryOpen(false)}
      />

      <p className="srOnly" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function noop() {}
