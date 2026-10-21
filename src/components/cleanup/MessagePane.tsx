"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { ChevronDown, Clock, Mail, Paperclip, Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { useApp } from "@/components/layout/AppShell";
import { reconnectHref } from "@/lib/mailbox/shared";
import {
  useActionRunner,
  useClearOutBasics,
  useMessageList,
  useResolveAll,
  type RunOutcome,
} from "@/hooks/useClearOut";
import type { ClearOutLabelDto, ClearOutMessageDto, SenderSuggestionDto } from "@/lib/api/types";
import { emails, failureSentence, successSentence, type ClearOutAction } from "@/lib/clearout/actions";
import { clearFilters, filterForSender, filterKey, hasFilters, olderLabel, type ClearOutFilter } from "@/lib/clearout/filters";
import { offersSelectAll, pageSelection, selectionScope } from "@/lib/clearout/selection";
import { MessageList, Pagination } from "@/components/clearout/MessageList";
import { MoreFilters } from "@/components/clearout/MoreFilters";
import { OlderPicker } from "@/components/clearout/OlderPicker";
import { AccessSheet, PreviewSheet } from "@/components/clearout/Panels";
import { Popover, menuKeys } from "@/components/clearout/Popover";
import { ReviewDialog } from "@/components/clearout/ReviewDialog";
import { SelectionBar } from "@/components/clearout/SelectionBar";
import { SenderPicker } from "@/components/clearout/SenderPicker";
import { totalLabel } from "@/components/clearout/format";
import glass from "@/components/home/glass.module.css";
import pickers from "@/components/clearout/Pickers.module.css";
import { EmptyPanel } from "./EmptyPanel";
import styles from "./MessagePane.module.css";

/**
 * The messages of whoever is focused: one sender's mail, or All emails.
 *
 * Everything here is about *organising mail* — finding it, selecting it, and
 * marking, labelling, archiving or trashing exactly what is selected. None of
 * it changes a sender's subscription, and the sender header above never
 * touches a message.
 *
 * The filters live in the URL (the page owns that). Applying one only changes
 * what is listed; mail changes only through the selection toolbar, and
 * Archive and Move to Trash only after a review of the exact emails.
 */

/** Rows per page. The workspace is built to hold exactly this many. */
export const MESSAGE_PAGE_SIZE = 10;

export type MessageTarget =
  | { kind: "all" }
  | { kind: "sender"; address: string; name: string };

type Menu = "sender" | "older" | "scope" | "sort" | "more" | null;

type Notice = {
  outcome: RunOutcome;
  labelId: string | null;
};

export const ACCESS_MESSAGES: Record<string, { tone: "success" | "warning"; text: string }> = {
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

export function MessagePane({
  target,
  pending,
  filter,
  onFilter,
  accessNotice,
  onDismissAccessNotice,
  onBrowseAll,
  onRunFinished,
  paneRef,
}: {
  /** Whose mail to show; null while that is still being worked out. */
  target: MessageTarget | null;
  /** The sender is still being worked out, so the list shows it is loading. */
  pending: boolean;
  /** The filters as they are in the URL. Its `senders` only apply to All emails. */
  filter: ClearOutFilter;
  onFilter: (next: ClearOutFilter, mode?: "push" | "replace") => void;
  /** The outcome of a permission trip to Google, shown once. */
  accessNotice: string | null;
  onDismissAccessNotice: () => void;
  /** Offered when there is no sender to show. */
  onBrowseAll: () => void;
  /** An action finished, so History has something new. */
  onRunFinished: () => void;
  paneRef?: Ref<HTMLDivElement>;
}) {
  const { demo, accountEmail, mailbox } = useApp();

  const sender = target?.kind === "sender" ? target : null;
  // One sender's mail is always filtered by that sender's exact address — never by name.
  const effective = useMemo<ClearOutFilter>(
    () => (sender ? filterForSender(filter, sender.address) : filter),
    [filter, sender],
  );
  const key = filterKey(effective);
  // The sender is the subject of the pane, not a filter on it.
  const narrowing = useMemo<ClearOutFilter>(() => (sender ? { ...effective, senders: [] } : effective), [effective, sender]);
  const update = (patch: Partial<ClearOutFilter>) => onFilter({ ...filter, ...patch });

  /* --- Search: types freely, applies after a pause ----------------------------- */

  const [search, setSearch] = useState(filter.search);
  const applied = useRef(filter.search);
  const filterRef = useRef(filter);
  filterRef.current = filter;
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
      onFilter({ ...filterRef.current, search }, "replace");
    }, 320);
    return () => window.clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Data -------------------------------------------------------------------- */

  const list = useMessageList(effective, MESSAGE_PAGE_SIZE, target !== null);
  const visible = list.messages;
  const { labels, access, lostOrganise } = useClearOutBasics(true);
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

  /* --- Selection ---------------------------------------------------------------- */

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [allMatching, setAllMatching] = useState<{ capped: boolean } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // A different result set — another sender, another filter — never inherits a
  // selection the person can't see.
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
    setSelected(new Set());
    setAllMatching(null);
    setNotice(null);
    resolver.cancel();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // What an action did is shown until the person starts choosing again; then
  // the toolbar for the new selection takes its place.
  const toggle = (message: ClearOutMessageDto) => {
    known.current.set(message.id, message);
    setAllMatching(null);
    setNotice(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(message.id)) next.delete(message.id);
      else next.add(message.id);
      return next;
    });
  };

  const pageIds = visible.map((m) => m.id);
  const pageState = pageSelection(selected, pageIds);
  const pageAll = pageState === "all";

  const togglePage = () => {
    setAllMatching(null);
    setNotice(null);
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
    window.setTimeout(() => document.getElementById("cleanup-select-page")?.focus(), 0);
  };

  const total = list.data?.total ?? 0;
  const totalExact = list.data?.totalExact ?? false;
  const morePages = list.hasNext || list.page > 0;

  const selectAllMatching = async () => {
    const started = keyRef.current;
    setNotice(null);
    // Everything is already on screen: nothing to look up.
    if (!morePages) {
      for (const message of visible) known.current.set(message.id, message);
      setSelected(new Set(pageIds));
      setAllMatching({ capped: false });
      return;
    }
    const result = await resolver.resolve(effective);
    if (!result || keyRef.current !== started) return;
    setSelected(new Set(result.ids));
    setAllMatching({ capped: result.capped });
  };

  const scopeNote = selectionScope({ selected, pageIds, allMatching });

  /* --- Actions -------------------------------------------------------------------- */

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
    onRunFinished();
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

  /* --- Panels --------------------------------------------------------------------- */

  const [menu, setMenu] = useState<Menu>(null);
  const refs = {
    sender: useRef<HTMLButtonElement>(null),
    older: useRef<HTMLButtonElement>(null),
    scope: useRef<HTMLButtonElement>(null),
    sort: useRef<HTMLButtonElement>(null),
    more: useRef<HTMLButtonElement>(null),
  };
  const toggleMenu = (next: Exclude<Menu, null>) => setMenu((current) => (current === next ? null : next));

  const [previewing, setPreviewing] = useState<ClearOutMessageDto | null>(null);

  /* --- Labels and copy --------------------------------------------------------------- */

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
  const filtered = hasFilters(narrowing);
  const searching = filter.search.trim().length > 0;

  const heading = sender
    ? `Emails from ${sender.name}`
    : filter.scope.kind === "all"
      ? "Everything in your mailbox"
      : scopeTitle;

  /* --- The list's states ---------------------------------------------------------------- */

  let empty: ReactNode;
  if (target === null) {
    empty = (
      <EmptyPanel
        title="No sender to show"
        body="Choose a sender on the left to see their emails, or browse everything in your mailbox."
      >
        <button type="button" className={`${styles.emptyButton} ${glass.button}`} onClick={onBrowseAll}>
          Browse all emails
        </button>
      </EmptyPanel>
    );
  } else if (list.error) {
    const reconnect = list.error.status === 403 || list.error.status === 409;
    empty = (
      <EmptyPanel title={reconnect ? "Reconnect Gmail to continue" : "Couldn’t load your emails"} body={list.error.message}>
        {reconnect && !demo && mailbox ? (
          <a className={`${styles.emptyButton} ${glass.button}`} href={reconnectHref(mailbox.id, { next: "/cleanup" })}>
            Reconnect Gmail
          </a>
        ) : (
          <button type="button" className={`${styles.emptyButton} ${glass.button}`} onClick={() => void list.refresh()}>
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
            ? `Nothing ${sender ? `from ${sender.name}` : scopeButton.toLowerCase() === "all mail" ? "in your mailbox" : `in ${scopeTitle}`} matches “${filter.search.trim()}”.`
            : "Try removing a filter or two.")
        }
      >
        <button
          type="button"
          className={`${styles.emptyButton} ${glass.button}`}
          onClick={() => onFilter({ ...clearFilters(filter), search: "" })}
        >
          {searching && filtered ? "Clear filters and search" : searching ? "Clear search" : "Clear filters"}
        </button>
      </EmptyPanel>
    );
  } else if (sender) {
    empty = (
      <EmptyPanel
        title={`No emails from ${sender.name} here`}
        body={
          filter.scope.kind === "all"
            ? "Tidely found this sender in an earlier scan, but there are no matching emails in your mailbox now — they may have been deleted."
            : `There are no emails from ${sender.name} in ${scopeTitle}. Try All mail.`
        }
      >
        {filter.scope.kind !== "all" ? (
          <button
            type="button"
            className={`${styles.emptyButton} ${glass.button}`}
            onClick={() => update({ scope: { kind: "all" } })}
          >
            Show all mail
          </button>
        ) : null}
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

  const selectAll = offersSelectAll({ allMatching, total, morePages, pageAll })
    ? {
        label: `Select all ${totalExact ? "" : "about "}${total.toLocaleString("en")}`,
        title: `Select all ${totalExact ? "" : "about "}${emails(total)} matching your filters`,
        onClick: () => void selectAllMatching(),
      }
    : null;

  /* --- The reserved action slot ------------------------------------------------------------
     One place above the list, always the same height: the selection toolbar,
     the outcome of an action, or a quiet hint. Showing one instead of another
     never moves the list. */

  let slot: ReactNode;
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
        scopeNote={scopeNote}
        pageState={pageState}
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
  } else if (accessNotice && ACCESS_MESSAGES[accessNotice]) {
    slotTone = ACCESS_MESSAGES[accessNotice].tone;
    slot = (
      <div className={styles.slotNotice} role="status">
        <p className={styles.slotText}>{ACCESS_MESSAGES[accessNotice].text}</p>
        <button type="button" className={styles.dismiss} onClick={onDismissAccessNotice} aria-label="Dismiss">
          <X size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>
    );
  } else {
    slot = (
      <p className={styles.hint}>
        Select emails to mark them as read, label them, archive them or move them to Trash.
      </p>
    );
  }

  const note = list.data?.notes.length && visible.length ? list.data.notes.join(" ") : null;

  const closeMenu = useCallback(() => setMenu(null), []);

  return (
    <div className={styles.pane} ref={paneRef}>
      <div className={styles.headRow}>
        <div className={styles.heading}>
          <h3 className={styles.title} id="cleanup-messages-title">
            {heading}
          </h3>
          <p className={styles.count} aria-live="polite">
            {list.data ? totalLabel(total, totalExact).replace(/^About/, "about") : list.loading && target ? "Loading…" : ""}
          </p>
        </div>

        <div className={styles.anchor}>
          <button
            ref={refs.scope}
            type="button"
            className={styles.select}
            aria-haspopup="menu"
            aria-expanded={menu === "scope"}
            aria-label={`Show emails from: ${scopeButton}`}
            onClick={() => toggleMenu("scope")}
          >
            <span className={styles.selectText}>{scopeButton}</span>
            <ChevronDown size={18} strokeWidth={1.75} aria-hidden />
          </button>
          <Popover open={menu === "scope"} onClose={closeMenu} triggerRef={refs.scope} label="Show emails from" align="end" width="16rem">
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
            <p className={pickers.explain}>{scopeLine}</p>
            <p className={pickers.explain}>
              Each row is one email, not a whole conversation. Filtering never changes your mail.
            </p>
          </Popover>
        </div>
      </div>

      <div className={styles.toolbar} role="search">
        <div className={styles.searchField}>
          <Search size={19} strokeWidth={1.6} className={styles.searchIcon} aria-hidden />
          <label className="srOnly" htmlFor="cleanup-message-search">
            {sender ? `Search emails from ${sender.name}` : "Search emails or senders"}
          </label>
          <input
            id="cleanup-message-search"
            type="search"
            className={styles.search}
            placeholder={sender ? "Search this sender’s emails…" : "Search emails or senders…"}
            autoComplete="off"
            value={search}
            onChange={(event) => setSearch(event.target.value.slice(0, 200))}
          />
        </div>

        <div className={styles.anchor}>
          <button
            ref={refs.sort}
            type="button"
            className={styles.sort}
            aria-haspopup="dialog"
            aria-expanded={menu === "sort"}
            aria-label="Sort: Newest first"
            onClick={() => toggleMenu("sort")}
          >
            <SlidersHorizontal size={19} strokeWidth={1.6} aria-hidden />
            <span className={styles.selectText}>Newest first</span>
            <ChevronDown size={18} strokeWidth={1.75} aria-hidden />
          </button>
          <Popover open={menu === "sort"} onClose={closeMenu} triggerRef={refs.sort} label="Sort" align="end" width="18rem">
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
              Gmail search returns emails newest first, so that’s the order that works across your whole mailbox. Narrow
              the list with filters instead.
            </p>
          </Popover>
        </div>
      </div>

      <div className={styles.quick} role="group" aria-label="Quick filters">
        {sender ? null : (
          <div className={styles.anchor}>
            <button
              ref={refs.sender}
              type="button"
              className={`${styles.chip} ${glass.button}`}
              data-active={filter.senders.length > 0 || undefined}
              aria-haspopup="dialog"
              aria-expanded={menu === "sender"}
              onClick={() => toggleMenu("sender")}
            >
              <UserRound size={19} strokeWidth={1.6} aria-hidden />
              <span className={styles.chipText}>{senderButton}</span>
              <ChevronDown size={17} strokeWidth={1.75} aria-hidden />
            </button>
            <Popover open={menu === "sender"} onClose={closeMenu} triggerRef={refs.sender} label="Filter by sender" width="23rem">
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
        )}

        <div className={styles.anchor}>
          <button
            ref={refs.older}
            type="button"
            className={`${styles.chip} ${glass.button}`}
            data-active={filter.older !== null || undefined}
            aria-haspopup="dialog"
            aria-expanded={menu === "older"}
            onClick={() => toggleMenu("older")}
          >
            <Clock size={19} strokeWidth={1.6} aria-hidden />
            <span className={styles.chipText}>{olderButton}</span>
          </button>
          <Popover open={menu === "older"} onClose={closeMenu} triggerRef={refs.older} label="Older than" width="20rem">
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
          className={`${styles.chip} ${glass.button}`}
          data-active={filter.unread || undefined}
          aria-pressed={filter.unread}
          onClick={() => update({ unread: !filter.unread })}
        >
          <Mail size={19} strokeWidth={1.6} aria-hidden />
          <span className={styles.chipText}>Unread</span>
        </button>

        <button
          type="button"
          className={`${styles.chip} ${glass.button}`}
          data-active={filter.attachments || undefined}
          aria-pressed={filter.attachments}
          onClick={() => update({ attachments: !filter.attachments })}
        >
          <Paperclip size={19} strokeWidth={1.6} aria-hidden />
          <span className={styles.chipText}>With attachments</span>
        </button>

        <div className={styles.anchor}>
          <button
            ref={refs.more}
            type="button"
            className={`${styles.chip} ${glass.button}`}
            data-active={moreCount > 0 || undefined}
            aria-haspopup="dialog"
            aria-expanded={menu === "more"}
            onClick={() => toggleMenu("more")}
          >
            <SlidersHorizontal size={19} strokeWidth={1.6} aria-hidden />
            <span className={styles.chipText}>More filters</span>
            {moreCount ? <span className={styles.chipCount}>{moreCount}</span> : null}
          </button>
          <Popover open={menu === "more"} onClose={closeMenu} triggerRef={refs.more} label="More filters" align="end" width="21rem">
            <MoreFilters filter={filter} onChange={update} />
          </Popover>
        </div>

        {filtered ? (
          <button type="button" className={styles.clearFilters} onClick={() => onFilter(clearFilters(filter))}>
            Clear filters
          </button>
        ) : null}
      </div>

      <div className={styles.slot} data-tone={slotTone}>
        {slot}
      </div>

      <MessageList
        messages={visible}
        loading={(target !== null && list.loading) || pending}
        selected={selected}
        locked={busy || resolver.progress !== null}
        skeletonRows={MESSAGE_PAGE_SIZE}
        showSender={!sender}
        onToggle={toggle}
        onTogglePage={togglePage}
        onOpen={setPreviewing}
        empty={empty}
        footer={
          <Pagination
            page={list.page}
            hasNext={list.hasNext}
            pageSize={MESSAGE_PAGE_SIZE}
            shown={visible.length}
            total={total}
            totalExact={totalExact}
            loading={list.loading}
            note={note}
            onPage={(page) => list.goTo(page)}
          />
        }
      />

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

      <AccessSheet
        open={accessOpen}
        grantUrl={access?.grantUrl ?? null}
        email={accountEmail}
        onClose={() => setAccessOpen(false)}
      />
    </div>
  );
}

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
  ref: Ref<HTMLDivElement>;
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
