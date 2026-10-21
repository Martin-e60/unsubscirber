/**
 * What a message selection covers, in words and in buttons.
 *
 * Pure, so the toolbar's honesty — "3 selected, on this page" — is pinned down
 * by a test instead of living inside a component. A selection is always a set
 * of message ids; it is never a position, a page or a filter, so it cannot
 * quietly retarget when the list changes (the page drops it when the filter
 * or the sender changes — see MessagePane).
 */

import { MAX_SELECTION } from "./actions";

export type SelectionScope = { short: string; long: string };

/** How much of the visible page is selected: for the master checkbox. */
export function pageSelection(
  selected: ReadonlySet<string>,
  pageIds: readonly string[],
): "none" | "some" | "all" {
  if (pageIds.length === 0) return "none";
  const chosen = pageIds.filter((id) => selected.has(id)).length;
  return chosen === 0 ? "none" : chosen === pageIds.length ? "all" : "some";
}

/**
 * What the count covers. "All matching" only after Select all gathered every
 * match; "on this page" only while everything selected is on this page.
 */
export function selectionScope(input: {
  selected: ReadonlySet<string>;
  pageIds: readonly string[];
  /** Set once Select all gathered the matching emails; `capped` if there were more than one action can take. */
  allMatching: { capped: boolean } | null;
}): SelectionScope | null {
  const { selected, pageIds, allMatching } = input;
  if (selected.size === 0) return null;

  if (allMatching) {
    return allMatching.capped
      ? {
          short: "limit reached",
          long: `The first ${MAX_SELECTION.toLocaleString("en")} emails matching your filters — the most one action can cover.`,
        }
      : { short: "all matching", long: "Every email matching your filters, on every page." };
  }

  const onPage = [...selected].every((id) => pageIds.includes(id));
  return onPage
    ? { short: "on this page", long: "Only the emails on this page." }
    : { short: "across pages", long: "Emails you selected on more than one page." };
}

/**
 * Whether to offer "Select all N". Not once everything is already selected
 * (all matching, or the whole result fits one page and it is all ticked).
 */
export function offersSelectAll(input: {
  allMatching: { capped: boolean } | null;
  total: number;
  /** There is more than this page: a next or an earlier one. */
  morePages: boolean;
  pageAll: boolean;
}): boolean {
  const { allMatching, total, morePages, pageAll } = input;
  return !allMatching && total > 0 && (morePages || !pageAll);
}
