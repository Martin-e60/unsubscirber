"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Clock,
  History,
  Info,
  Mail,
  Paperclip,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
// The short serif accent in the title — the same face Home and Cleanup use.
import "@fontsource-variable/newsreader/wght-italic.css";
import { useApp } from "@/components/layout/AppShell";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  useActionRunner,
  useClearOutBasics,
  useClearOutHistory,
  useMessageList,
  useResolveAll,
  type RunOutcome,
} from "@/hooks/useClearOut";
import type { ClearOutLabelDto, ClearOutMessageDto, SenderSuggestionDto } from "@/lib/api/types";
import {
  emails,
  failureSentence,
  successSentence,
  type ClearOutAction,
} from "@/lib/clearout/actions";
import {
  clearFilters,
  clearOutHref,
  filterKey,
  hasFilters,
  olderLabel,
  parseFilter,
  type ClearOutFilter,
} from "@/lib/clearout/filters";
import { totalLabel } from "./format";
import { MessageList, Pagination } from "./MessageList";
import { MoreFilters } from "./MoreFilters";
import { OlderPicker } from "./OlderPicker";
import { AccessSheet, HistorySheet, PreviewSheet } from "./Panels";
import { Popover, menuKeys } from "./Popover";
import { ReviewDialog } from "./ReviewDialog";
import { SelectionBar } from "./SelectionBar";
import { SenderPicker } from "./SenderPicker";
import buttons from "@/components/cleanup/buttons.module.css";
import pickers from "./Pickers.module.css";
import styles from "./ClearOutView.module.css";

/**
 * Clear out: find, organise and clear email already in the mailbox — personal
 * and work mail, receipts, notifications and newsletters alike.
 *
 * Distinct from the other pages: Cleanup decides which mailing lists to keep
 * or leave; Clear out acts on individual messages and never changes a
 * sender's Keeping or unsubscribe status.
 *
 * The filters live in the URL. Applying one only changes what is listed;
 * mail changes only through the selection toolbar, and Archive and Move to
 * Trash only after a review of the exact emails.
 */

/**
 * Wide and tall enough for the whole workspace to fit the window: the page
 * stops scrolling and each page of results holds as many rows as the list
 * has room for. The same query appears in the CSS modules, which lay the
 * page out to match. Anything smaller scrolls normally.
 */
export const FIT_QUERY = "(min-width: 60rem) and (min-height: 36rem)";

/** Rows per page when the page scrolls normally (phones, short windows). */
const SCROLL_PAGE_SIZE = 20;
/** Never fewer than this on a page, however short the window. */
const MIN_ROWS = 3;

/**
 * How many rows the list area has room for, kept in step as the window
 * changes. Null until measured, so nothing is fetched at a guessed size.
 */
function useFitRows(area: React.RefObject<HTMLDivElement | null>, enabled: boolean): number | null {
  const [rows, setRows] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = area.current;
    if (!enabled || !element) return;
    let timer = 0;
    const measure = () => {
      const rowPx = Number.parseFloat(getComputedStyle(element).getPropertyValue("--row-px")) || 46;
      const next = Math.max(MIN_ROWS, Math.floor(element.clientHeight / rowPx));
      // The rows share what is left over, so the list ends at the footer
      // instead of leaving a gap — never taller than a comfortable 50px.
      const share = Math.min(50, Math.max(rowPx, Math.floor(element.clientHeight / next)));
      element.style.setProperty("--row-fill", `${share}px`);
      setRows((current) => (current === next ? current : next));
    };
    measure();
    // A resize settles before the page size changes, so dragging a window
    // edge does not fetch at every intermediate height.
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 160);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [area, enabled]);

  return enabled ? rows : null;
}

type Menu = "sender" | "older" | "scope" | "sort" | "more" | "info" | null;

type Notice = {
  outcome: RunOutcome;
  labelId: string | null;
};

const ACCESS_MESSAGES: Record<string, { tone: "success" | "warning"; text: string }> = {
  granted: { tone: "success", text: "Done — Tidely can now organise the emails you select." },
  declined: {
    tone: "warning",
    text: "Organising wasn’t allowed in Google’s screen, so nothing changed. You can still search and preview.",
  },
  cancelled: { tone: "warning", text: "You cancelled at Google. Nothing changed." },
  wrong_account: {
    tone: "warning",
    text: "That was a different Google account, so nothing was saved. Choose the mailbox you connected to Tidely.",
  },
  failed: { tone: "warning", text: "Google couldn’t complete that. Nothing changed — please try again." },
};

export function ClearOutView() {
  const { demo, basePath, accountEmail } = useApp();

  /* --- Filters: all of them in the URL ------------------------------------------ */

  const params = useSearchParams();
  const filter = useMemo(() => parseFilter(new URLSearchParams(params.toString())), [params]);
  const key = filterKey(filter);

  const setFilter = useCallback(
    (next: ClearOutFilter, mode: "push" | "replace" = "push") => {
      const url = clearOutHref(basePath, next);
      if (mode === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [basePath],
  );
  const update = (patch: Partial<ClearOutFilter>) => setFilter({ ...filter, ...patch });

  // The search box types freely and applies after a pause.
  const [search, setSearch] = useState(filter.search);
  const applied = useRef(filter.search);
  useEffect(() => {
    if (filter.search !== applied.current) {
      applied.current = filter.search;
      setSearch(filter.search);
    }
  }, [filter.search]);
  useEffect(() => {
    if (search === applied.current) return;
    const timer = window.setTimeout(() => {
      applied.current = search;
      setFilter({ ...filter, search }, "replace");
    }, 320);
    return () => window.clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // The result of a permission reconnect, shown once and then dropped from the URL.
  const [accessNotice, setAccessNotice] = useState<string | null>(null);
  useEffect(() => {
    const outcome = params.get("access");
    if (!outcome) return;
    setAccessNotice(ACCESS_MESSAGES[outcome] ? outcome : "failed");
    setFilter(filter, "replace");
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Data ---------------------------------------------------------------------------- */

  // The page size follows the room the list actually has. A new size starts
  // again from the first page (Gmail's page tokens belong to one size), but
  // the selection is kept: it holds message ids, not positions.
  const fit = useMediaQuery(FIT_QUERY);
  const areaRef = useRef<HTMLDivElement>(null);
  const fitRows = useFitRows(areaRef, fit === true);
  const pageSize = fit === null ? null : fit ? fitRows : SCROLL_PAGE_SIZE;

  const list = useMessageList(filter, pageSize ?? SCROLL_PAGE_SIZE, pageSize !== null);
  // Until a resize's new page arrives, rows loaded beyond the new size wait
  // off screen rather than push past the window.
  const visible = pageSize ? list.messages.slice(0, pageSize) : list.messages;
  const { labels, access, lostOrganise } = useClearOutBasics(true);
  const history = useClearOutHistory();
  const resolver = useResolveAll();
  const runner = useActionRunner();

  // Every row seen, so names and the review list can be shown without asking again.
  const known = useRef(new Map<string, ClearOutMessageDto>());
  const [senderNames, setSenderNames] = useState(() => new Map<string, string>());
  useEffect(() => {
    if (!list.messages.length) return;
    for (const message of list.messages) known.current.set(message.id, message);
    setSenderNames((current) => {
      const next = new Map(current);
      for (const m of list.messages) if (m.fromName && !next.has(m.fromAddress)) next.set(m.fromAddress, m.fromName);
      return next.size === current.size ? current : next;
    });
  }, [list.messages]);

  const seenSenders = useMemo<SenderSuggestionDto[]>(() => {
    const map = new Map<string, SenderSuggestionDto>();
    for (const m of list.messages) {
      if (!m.sentByMe && m.fromAddress && !map.has(m.fromAddress)) {
        map.set(m.fromAddress, { name: m.fromName, address: m.fromAddress });
      }
    }
    return [...map.values()];
  }, [list.messages]);

  /* --- Selection ------------------------------------------------------------------------- */

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [allMatching, setAllMatching] = useState<{ capped: boolean } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // A different result set never inherits a selection the person can't see.
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
    setSelected(new Set());
    setAllMatching(null);
    setNotice(null);
    resolver.cancel();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (message: ClearOutMessageDto) => {
    known.current.set(message.id, message);
    setAllMatching(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(message.id)) next.delete(message.id);
      else next.add(message.id);
      return next;
    });
  };

  const pageIds = visible.map((m) => m.id);
  const pageAll = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const togglePage = () => {
    setAllMatching(null);
    setSelected((current) => {
      const next = new Set(current);
      if (pageAll) for (const id of pageIds) next.delete(id);
      else for (const id of pageIds) next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    resolver.cancel();
    setSelected(new Set());
    setAllMatching(null);
    window.setTimeout(() => document.getElementById("clear-out-select-page")?.focus(), 0);
  };

  const selectAllMatching = async () => {
    const started = keyRef.current;
    const result = await resolver.resolve(filter);
    if (!result || keyRef.current !== started) return;
    setSelected(new Set(result.ids));
    setAllMatching({ capped: result.capped });
  };

  const total = list.data?.total ?? 0;
  const totalExact = list.data?.totalExact ?? false;
  const morePages = list.hasNext || list.page > 0;
  const selectionOnPage = [...selected].every((id) => pageIds.includes(id));
  const scopeNote = allMatching ? "All matching your filters" : selected.size && selectionOnPage ? "On this page" : "Across pages";

  /* --- Actions ------------------------------------------------------------------------------ */

  const [accessOpen, setAccessOpen] = useState(false);
  const [review, setReview] = useState<{ action: "archive" | "trash"; ids: string[] } | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const allowed = () => {
    if (access?.canOrganise) return true;
    setAccessOpen(true);
    return false;
  };

  const finish = async (outcome: RunOutcome | null, labelId: string | null) => {
    if (!outcome) return;
    if (outcome.stoppedBy === "permission") {
      lostOrganise();
      setAccessOpen(true);
    }
    // What did not happen stays selected, ready to retry; the rest is done.
    setSelected(new Set([...outcome.failed, ...outcome.skipped]));
    setAllMatching(null);
    setNotice({ outcome, labelId });
    window.setTimeout(() => noticeRef.current?.focus(), 0);
    await list.refresh();
    if (historyOpen) void history.refresh();
  };

  const run = async (action: Exclude<ClearOutAction, "archive" | "trash">, label?: ClearOutLabelDto) => {
    if (!allowed()) return;
    // Frozen now: rows that arrive later are never added to this action.
    const ids = [...selected];
    setNotice(null);
    const outcome = await runner.execute({ action, ids, labelId: label?.id ?? null, labelName: label?.name ?? null });
    await finish(outcome, label?.id ?? null);
  };

  const confirmReview = async () => {
    if (!review) return;
    const outcome = await runner.execute({ action: review.action, ids: review.ids });
    setReview(null);
    await finish(outcome, null);
  };

  const retry = async () => {
    if (!notice || !allowed()) return;
    const { outcome, labelId } = notice;
    setNotice(null);
    const next = await runner.execute({
      action: outcome.action,
      ids: outcome.failed,
      labelId,
      labelName: outcome.labelName,
      retryRun: outcome.run,
    });
    await finish(next, labelId);
  };

  /* --- Panels --------------------------------------------------------------------------------- */

  const [menu, setMenu] = useState<Menu>(null);
  const refs = {
    sender: useRef<HTMLButtonElement>(null),
    older: useRef<HTMLButtonElement>(null),
    scope: useRef<HTMLButtonElement>(null),
    sort: useRef<HTMLButtonElement>(null),
    more: useRef<HTMLButtonElement>(null),
    info: useRef<HTMLButtonElement>(null),
  };
  const toggleMenu = (next: Exclude<Menu, null>) => setMenu((current) => (current === next ? null : next));

  const [previewing, setPreviewing] = useState<ClearOutMessageDto | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  /* --- Labels and copy --------------------------------------------------------------------- */

  const labelName = (id: string) => labels?.find((label) => label.id === id)?.name ?? "Label";
  const scopeTitle =
    filter.scope.kind === "inbox" ? "Inbox" : filter.scope.kind === "label" ? labelName(filter.scope.id) : "All emails";
  const scopeButton =
    filter.scope.kind === "inbox" ? "Inbox" : filter.scope.kind === "label" ? labelName(filter.scope.id) : "All mail";
  const scopeLine =
    filter.scope.kind === "inbox"
      ? "Emails in your Inbox. Trash, Spam and drafts are excluded."
      : filter.scope.kind === "label"
        ? `Emails labelled “${labelName(filter.scope.id)}”, including archived ones. Trash, Spam and drafts are excluded.`
        : "Includes archived and sent emails. Trash, Spam and drafts are excluded.";

  const senderButton =
    filter.senders.length === 0
      ? "By sender"
      : filter.senders.length === 1
        ? (senderNames.get(filter.senders[0]) ?? filter.senders[0])
        : `${filter.senders.length} senders`;
  const olderButton = olderLabel(filter.older) ?? "Older than…";
  const moreCount = (filter.larger ? 1 : 0) + (filter.unsubscribed ? 1 : 0);
  const filtered = hasFilters(filter);
  const searching = filter.search.trim().length > 0;

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...filter.senders.map((address) => ({
      key: `from:${address}`,
      label: `From: ${senderNames.get(address) ?? address}`,
      remove: () => update({ senders: filter.senders.filter((a) => a !== address) }),
    })),
    ...(filter.older ? [{ key: "older", label: olderButton, remove: () => update({ older: null }) }] : []),
    ...(filter.unread ? [{ key: "unread", label: "Unread", remove: () => update({ unread: false }) }] : []),
    ...(filter.attachments
      ? [{ key: "attachments", label: "With attachments", remove: () => update({ attachments: false }) }]
      : []),
    ...(filter.larger
      ? [{ key: "larger", label: `Larger than ${filter.larger} MB`, remove: () => update({ larger: null }) }]
      : []),
    ...(filter.unsubscribed
      ? [{ key: "unsubscribed", label: "From unsubscribed lists", remove: () => update({ unsubscribed: false }) }]
      : []),
  ];

  /* --- The list's states ------------------------------------------------------------------- */

  let empty: ReactNode;
  if (list.error) {
    const reconnect = list.error.status === 403 || list.error.status === 409;
    empty = (
      <EmptyPanel
        title={reconnect ? "Reconnect Gmail to continue" : "Couldn’t load your emails"}
        body={list.error.message}
      >
        {reconnect && !demo ? (
          <a className={`${buttons.primary} ${buttons.small}`} href="/api/auth/google/start?mode=connect">
            Reconnect Gmail
          </a>
        ) : (
          <button type="button" className={`${buttons.secondary} ${buttons.small}`} onClick={() => void list.refresh()}>
            Try again
          </button>
        )}
      </EmptyPanel>
    );
  } else if (filtered || searching) {
    empty = (
      <EmptyPanel
        title="No emails match"
        body={
          list.data?.notes[0] ??
          (searching && !filtered
            ? `Nothing in ${scopeButton.toLowerCase() === "all mail" ? "your mailbox" : scopeTitle} matches “${filter.search.trim()}”.`
            : "Try removing a filter or two.")
        }
      >
        <button
          type="button"
          className={`${buttons.secondary} ${buttons.small}`}
          onClick={() => setFilter({ ...clearFilters(filter), search: "" })}
        >
          {searching && filtered ? "Clear filters and search" : searching ? "Clear search" : "Clear filters"}
        </button>
      </EmptyPanel>
    );
  } else {
    empty = (
      <EmptyPanel
        title={filter.scope.kind === "all" ? "No emails here" : `Nothing in ${scopeTitle}`}
        body={filter.scope.kind === "inbox" ? "Your Inbox is empty. Nicely done." : "There’s nothing to organise here right now."}
      />
    );
  }

  const busy = runner.running;

  const selectAll =
    pageAll && morePages && !allMatching
      ? {
          label: `Select all ${totalExact ? "" : "about "}${total.toLocaleString("en")} matching`,
          onClick: () => void selectAllMatching(),
        }
      : null;

  /* --- The reserved action slot ------------------------------------------------------------
     One place below the list, always the same height on wide screens: the
     selection toolbar, the outcome of an action, or a quiet hint. Showing
     one instead of another never moves the list or changes its page size. */

  let slot: ReactNode = null;
  let slotTone: "selected" | "success" | "warning" | "idle" = "idle";
  const showBar = selected.size > 0 || runner.progress !== null || resolver.progress !== null;

  if (notice && !runner.running && !resolver.progress) {
    const clean = notice.outcome.failed.length === 0 && notice.outcome.skipped.length === 0;
    slotTone = clean ? "success" : "warning";
    slot = (
      <ActionNotice
        ref={noticeRef}
        notice={notice}
        busy={busy}
        selectedCount={selected.size}
        onRetry={() => void retry()}
        onClearSelection={clearSelection}
        onDismiss={() => setNotice(null)}
      />
    );
  } else if (showBar) {
    slotTone = "selected";
    slot = (
      <SelectionBar
        count={selected.size}
        scopeNote={selected.size ? scopeNote : null}
        labels={labels}
        progress={runner.progress}
        resolving={resolver.progress}
        selectAll={selectAll}
        onCancelResolve={resolver.cancel}
        onClear={clearSelection}
        onMarkRead={() => void run("mark_read")}
        onLabel={(label) => void run("label", label)}
        onOrganise={(action) => {
          if (!allowed()) return;
          // Frozen here: this is exactly what the review shows and what runs.
          setReview({ action, ids: [...selected] });
        }}
        onStop={runner.requestStop}
      />
    );
  } else if (accessNotice) {
    slotTone = ACCESS_MESSAGES[accessNotice].tone;
    slot = (
      <div className={styles.slotNotice} role="status">
        <p className={styles.slotText}>{ACCESS_MESSAGES[accessNotice].text}</p>
        <button type="button" className={styles.dismiss} onClick={() => setAccessNotice(null)} aria-label="Dismiss">
          <X size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>
    );
  } else if (fit) {
    slot = (
      <p className={styles.hint}>
        Select emails to mark them as read, label them, archive them or move them to Trash.
      </p>
    );
  }

  const note = list.data?.notes.length && visible.length ? list.data.notes.join(" ") : null;

  return (
    <div className={styles.page} data-clearout-workspace="">
      <header className={styles.header}>
        <div className={styles.intro}>
          <h1 className={styles.title}>
            Your mailbox. <span className={styles.accent}>Your way.</span>
          </h1>
          <p className={styles.lede}>Find, organise, and clear emails in one place.</p>
        </div>
        <button
          type="button"
          className={styles.history}
          onClick={() => {
            setHistoryOpen(true);
            void history.refresh();
          }}
        >
          <History size={20} strokeWidth={1.7} aria-hidden />
          History
        </button>
      </header>

      {/* --- Quick filters --------------------------------------------------------------- */}
      <div className={styles.quick} role="group" aria-label="Quick filters">
        <div className={styles.anchor}>
          <button
            ref={refs.sender}
            type="button"
            className={styles.quickButton}
            data-active={filter.senders.length > 0 || undefined}
            aria-haspopup="dialog"
            aria-expanded={menu === "sender"}
            onClick={() => toggleMenu("sender")}
          >
            <UserRound size={21} strokeWidth={1.6} aria-hidden />
            <span className={styles.quickText}>{senderButton}</span>
            <ChevronDown size={18} strokeWidth={1.9} className={styles.chevron} aria-hidden />
          </button>
          <Popover
            open={menu === "sender"}
            onClose={() => setMenu(null)}
            triggerRef={refs.sender}
            label="Filter by sender"
            width="23rem"
          >
            <SenderPicker
              selected={filter.senders}
              names={senderNames}
              seen={seenSenders}
              onChange={(next) => update({ senders: next })}
              onDone={() => {
                setMenu(null);
                refs.sender.current?.focus();
              }}
            />
          </Popover>
        </div>

        <div className={styles.anchor}>
          <button
            ref={refs.older}
            type="button"
            className={styles.quickButton}
            data-active={filter.older !== null || undefined}
            aria-haspopup="dialog"
            aria-expanded={menu === "older"}
            onClick={() => toggleMenu("older")}
          >
            <Clock size={21} strokeWidth={1.6} aria-hidden />
            <span className={styles.quickText}>{olderButton}</span>
            <ChevronDown size={18} strokeWidth={1.9} className={styles.chevron} aria-hidden />
          </button>
          <Popover
            open={menu === "older"}
            onClose={() => setMenu(null)}
            triggerRef={refs.older}
            label="Older than"
            width="20rem"
          >
            <OlderPicker
              value={filter.older}
              onChange={(next) => {
                update({ older: next });
                setMenu(null);
                refs.older.current?.focus();
              }}
            />
          </Popover>
        </div>

        <button
          type="button"
          className={styles.quickButton}
          data-active={filter.unread || undefined}
          aria-pressed={filter.unread}
          onClick={() => update({ unread: !filter.unread })}
        >
          <Mail size={21} strokeWidth={1.6} aria-hidden />
          <span className={styles.quickText}>Unread</span>
        </button>

        <button
          type="button"
          className={styles.quickButton}
          data-active={filter.attachments || undefined}
          aria-pressed={filter.attachments}
          onClick={() => update({ attachments: !filter.attachments })}
        >
          <Paperclip size={21} strokeWidth={1.6} aria-hidden />
          <span className={styles.quickText}>With attachments</span>
        </button>
      </div>

      {/* --- The mailbox ----------------------------------------------------------------- */}
      <section className={styles.panel} aria-labelledby="clear-out-scope-title">
        <div className={styles.panelHead}>
          <div className={styles.panelHeading}>
            <h2 id="clear-out-scope-title" className={styles.panelTitle}>
              {scopeTitle}
            </h2>
            <p className={styles.panelCount} aria-live="polite">
              {list.data ? totalLabel(total, totalExact).replace(/^About/, "about") : list.loading ? "Loading…" : ""}
            </p>
            <div className={styles.anchor}>
              <button
                ref={refs.info}
                type="button"
                className={styles.info}
                aria-label="What this list includes"
                aria-haspopup="dialog"
                aria-expanded={menu === "info"}
                onClick={() => toggleMenu("info")}
              >
                <Info size={19} strokeWidth={1.8} aria-hidden />
              </button>
              <Popover
                open={menu === "info"}
                onClose={() => setMenu(null)}
                triggerRef={refs.info}
                label="What this list includes"
                width="20rem"
                initialFocus="panel"
              >
                <p className={pickers.explain}>{scopeLine}</p>
                <p className={pickers.explain}>
                  Each row is one email, not a whole conversation. Filtering never changes your mail.
                </p>
              </Popover>
            </div>
          </div>

          {chips.length ? (
            <ActiveFilters chips={chips} onClear={() => setFilter(clearFilters(filter))} />
          ) : (
            <span className={styles.headSpacer} />
          )}

          <div className={styles.anchor}>
            <button
              ref={refs.scope}
              type="button"
              className={styles.select}
              aria-haspopup="menu"
              aria-expanded={menu === "scope"}
              aria-label={`Mailbox: ${scopeButton}`}
              onClick={() => toggleMenu("scope")}
            >
              <span className={styles.selectText}>{scopeButton}</span>
              <ChevronDown size={18} strokeWidth={1.9} aria-hidden />
            </button>
            <Popover
              open={menu === "scope"}
              onClose={() => setMenu(null)}
              triggerRef={refs.scope}
              label="Show emails from"
              align="end"
              width="16rem"
            >
              <div role="menu" aria-label="Show emails from" className={pickers.options} onKeyDown={menuKeys}>
                {[
                  { kind: "all" as const, name: "All mail", id: "" },
                  { kind: "inbox" as const, name: "Inbox", id: "" },
                  ...(labels ?? []).map((label) => ({ kind: "label" as const, name: label.name, id: label.id })),
                ].map((option) => {
                  const on =
                    option.kind === filter.scope.kind &&
                    (option.kind !== "label" || (filter.scope.kind === "label" && filter.scope.id === option.id));
                  return (
                    <button
                      key={`${option.kind}:${option.id}`}
                      type="button"
                      role="menuitemradio"
                      aria-checked={on}
                      className={pickers.option}
                      data-on={on || undefined}
                      onClick={() => {
                        setMenu(null);
                        refs.scope.current?.focus();
                        update({
                          scope: option.kind === "label" ? { kind: "label", id: option.id } : { kind: option.kind },
                        });
                      }}
                    >
                      <span className={pickers.optionMark} aria-hidden="true" />
                      <span className={pickers.optionText}>
                        <span className={pickers.optionName}>{option.name}</span>
                      </span>
                    </button>
                  );
                })}
                {labels === null ? <p className={pickers.emptyNote}>Loading labels…</p> : null}
              </div>
            </Popover>
          </div>
        </div>

        <div className={styles.toolbar} role="search">
          <div className={styles.searchField}>
            <Search size={19} strokeWidth={1.8} className={styles.searchIcon} aria-hidden />
            <label className="srOnly" htmlFor="clear-out-search">
              Search emails or senders
            </label>
            <input
              id="clear-out-search"
              type="search"
              className={styles.search}
              placeholder="Search emails or senders"
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value.slice(0, 200))}
            />
          </div>

          <div className={styles.anchor}>
            <button
              ref={refs.more}
              type="button"
              className={styles.tool}
              data-active={moreCount > 0 || undefined}
              aria-haspopup="dialog"
              aria-expanded={menu === "more"}
              onClick={() => toggleMenu("more")}
            >
              <SlidersHorizontal size={19} strokeWidth={1.8} aria-hidden />
              Filters
              {moreCount ? <span className={styles.toolCount}>{moreCount}</span> : null}
            </button>
            <Popover
              open={menu === "more"}
              onClose={() => setMenu(null)}
              triggerRef={refs.more}
              label="More filters"
              align="end"
              width="21rem"
            >
              <MoreFilters filter={filter} onChange={update} />
            </Popover>
          </div>

          <div className={styles.anchor}>
            <button
              ref={refs.sort}
              type="button"
              className={styles.select}
              aria-haspopup="dialog"
              aria-expanded={menu === "sort"}
              aria-label="Sort: Newest first"
              onClick={() => toggleMenu("sort")}
            >
              <span className={styles.selectText}>Newest first</span>
              <ChevronDown size={18} strokeWidth={1.9} aria-hidden />
            </button>
            <Popover
              open={menu === "sort"}
              onClose={() => setMenu(null)}
              triggerRef={refs.sort}
              label="Sort"
              align="end"
              width="18rem"
            >
              <div role="menu" aria-label="Sort" className={pickers.menuList} onKeyDown={menuKeys}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked
                  className={pickers.option}
                  data-on
                  onClick={() => {
                    setMenu(null);
                    refs.sort.current?.focus();
                  }}
                >
                  <span className={pickers.optionMark} aria-hidden="true" />
                  <span className={pickers.optionText}>
                    <span className={pickers.optionName}>Newest first</span>
                  </span>
                </button>
              </div>
              <p className={pickers.explain}>
                Gmail search returns emails newest first, so that’s the order that works across your whole mailbox.
                Narrow the list with filters instead.
              </p>
            </Popover>
          </div>
        </div>

        <MessageList
          messages={visible}
          loading={list.loading || pageSize === null}
          selected={selected}
          locked={busy || resolver.progress !== null}
          skeletonRows={pageSize ?? 8}
          areaRef={areaRef}
          onToggle={toggle}
          onTogglePage={togglePage}
          onOpen={setPreviewing}
          empty={empty}
          footer={
            <Pagination
              page={list.page}
              hasNext={list.hasNext}
              pageSize={pageSize ?? SCROLL_PAGE_SIZE}
              shown={visible.length}
              total={total}
              totalExact={totalExact}
              loading={list.loading}
              note={note}
              onPage={(page) => {
                list.goTo(page);
                // Scrolling layouts move back up to the list; the fitted one has nowhere to go.
                if (!fit) document.getElementById("clear-out-scope-title")?.scrollIntoView({ block: "start" });
              }}
            />
          }
        />
      </section>

      {slot ? (
        <div className={styles.slot} data-tone={slotTone}>
          {slot}
        </div>
      ) : null}

      <ReviewDialog
        action={review?.action ?? null}
        ids={review?.ids ?? []}
        known={known.current}
        progress={runner.progress}
        demo={demo}
        onConfirm={() => void confirmReview()}
        onCancel={() => setReview(null)}
        onStop={runner.requestStop}
      />

      <PreviewSheet
        message={previewing}
        selected={previewing ? selected.has(previewing.id) : false}
        demo={demo}
        onToggle={toggle}
        onClose={() => setPreviewing(null)}
      />

      <HistorySheet
        open={historyOpen}
        runs={history.runs}
        error={history.error}
        demo={demo}
        onClose={() => setHistoryOpen(false)}
      />

      <AccessSheet
        open={accessOpen}
        grantUrl={access?.grantUrl ?? null}
        email={accountEmail}
        onClose={() => setAccessOpen(false)}
      />
    </div>
  );
}

/* --- Pieces ------------------------------------------------------------------------------ */

/** What an action did, in the action slot, with Retry for anything that failed. */
function ActionNotice({
  notice,
  busy,
  selectedCount,
  onRetry,
  onClearSelection,
  onDismiss,
  ref,
}: {
  notice: Notice;
  busy: boolean;
  selectedCount: number;
  onRetry: () => void;
  onClearSelection: () => void;
  onDismiss: () => void;
  ref: React.Ref<HTMLDivElement>;
}) {
  const { outcome } = notice;
  const ok = outcome.succeeded.length;
  const failed = outcome.failed.length;
  const skipped = outcome.skipped.length;

  const lines: string[] = [];
  if (ok > 0) lines.push(successSentence(outcome.action, ok, outcome.labelName));
  if (failed > 0) lines.push(`${failureSentence(outcome.action, failed)} They’re still selected.`);
  if (skipped > 0) {
    lines.push(
      outcome.stoppedBy === "user"
        ? `Stopped before ${emails(skipped)} — they weren’t changed.`
        : outcome.stoppedBy === "permission"
          ? `${emails(skipped)} weren’t changed: Tidely needs your permission to organise mail.`
          : `${emails(skipped)} weren’t changed. ${outcome.errorMessage ?? "Please try again."}`,
    );
  }
  if (lines.length === 0) lines.push("Nothing was changed.");
  const text = lines.join(" ");

  return (
    <div ref={ref} tabIndex={-1} className={styles.slotNotice} role="status" aria-live="polite">
      <p className={styles.slotText} title={text}>
        {text}
      </p>
      <div className={styles.noticeActions}>
        {failed > 0 ? (
          <button type="button" className={styles.slotButton} onClick={onRetry} disabled={busy}>
            Retry {emails(failed)}
          </button>
        ) : null}
        {selectedCount > 0 ? (
          <button type="button" className={styles.slotLink} onClick={onClearSelection} disabled={busy}>
            Clear selection
          </button>
        ) : null}
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
          <X size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}

type Chip = { key: string; label: string; remove: () => void };

/**
 * The active filters, on one line in the panel header. As many as fit are
 * shown; the rest wait behind "+2 more", where each can still be removed.
 * Widths come from an invisible copy of every chip, so the count is right
 * whichever chips are currently showing.
 */
function ActiveFilters({ chips, onClear }: { chips: Chip[]; onClear: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(chips.length);
  const [open, setOpen] = useState(false);
  const labelsKey = chips.map((chip) => chip.label).join("|");

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;
    const fitChips = () => {
      const widths = [...measure.children].map((child) => child.getBoundingClientRect().width);
      const clearWidth = widths[widths.length - 1];
      const moreWidth = widths[widths.length - 2];
      const gap = 6;
      const room = wrap.clientWidth;
      let used = clearWidth;
      let count = 0;
      for (let i = 0; i < chips.length; i++) {
        const last = i === chips.length - 1;
        const need = used + gap + widths[i] + (last ? 0 : gap + moreWidth);
        if (need > room) break;
        used += gap + widths[i];
        count++;
      }
      setShown(count);
    };
    fitChips();
    const observer = new ResizeObserver(fitChips);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [labelsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const hidden = chips.slice(shown);

  return (
    <div className={styles.chips} ref={wrapRef} role="group" aria-label="Active filters">
      {chips.slice(0, shown).map((chip) => (
        <button
          key={chip.key}
          type="button"
          className={styles.chip}
          onClick={chip.remove}
          aria-label={`Remove filter: ${chip.label}`}
        >
          <span className={styles.chipText}>{chip.label}</span>
          <X size={14} strokeWidth={2.1} aria-hidden />
        </button>
      ))}
      {hidden.length ? (
        <span className={styles.anchor}>
          <button
            ref={moreRef}
            type="button"
            className={styles.chip}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            +{hidden.length} {shown === 0 ? (hidden.length === 1 ? "filter" : "filters") : "more"}
          </button>
          <Popover open={open} onClose={() => setOpen(false)} triggerRef={moreRef} label="More active filters" width="17rem">
            <div className={pickers.menuList}>
              {hidden.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className={pickers.option}
                  onClick={chip.remove}
                  aria-label={`Remove filter: ${chip.label}`}
                >
                  <span className={pickers.optionText}>
                    <span className={pickers.optionName}>{chip.label}</span>
                  </span>
                  <X size={15} strokeWidth={2} aria-hidden />
                </button>
              ))}
            </div>
          </Popover>
        </span>
      ) : null}
      <button type="button" className={styles.clearFilters} onClick={onClear}>
        Clear filters
      </button>

      {/* Invisible: every chip at its natural width, for the arithmetic above. */}
      <div className={styles.chipMeasure} ref={measureRef} aria-hidden="true">
        {chips.map((chip) => (
          <span key={chip.key} className={styles.chip}>
            <span className={styles.chipText}>{chip.label}</span>
            <X size={14} strokeWidth={2.1} />
          </span>
        ))}
        <span className={styles.chip}>+{chips.length} filters</span>
        <span className={styles.clearFilters}>Clear filters</span>
      </div>
    </div>
  );
}

function EmptyPanel({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <h3 className={styles.emptyTitle}>{title}</h3>
      <p className={styles.emptyBody}>{body}</p>
      {children ? <div className={styles.emptyAction}>{children}</div> : null}
    </div>
  );
}
