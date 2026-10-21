/**
 * The signed-in navigation, as data.
 *
 * Kept out of the component so it can be asserted on in a test without pulling a
 * React tree and a stylesheet into the test runner — and so the demo can mount
 * the same screens under its own base path from the same list.
 *
 * Rollups is deliberately absent: it marked senders for a digest that was never
 * built. Accounts that used it reach the retired page from Settings, and nobody
 * else is shown a dead end.
 *
 * Senders is absent too: kept senders live in Cleanup's Keeping view, and
 * unsubscribe outcomes that still need something are filters inside To review.
 * The old /senders links redirect there — see `sendersRedirect`.
 *
 * Clear out is absent as well: organising mail is part of Cleanup now, where
 * selecting a sender shows its messages. The old /clear-out links redirect
 * there — see `clearOutRedirect`.
 *
 * Each page has one job: Home is the overview, Cleanup decides which mailing
 * lists to keep or leave and organises the mail in the mailbox, and
 * Unsubscribed reviews what happened after leaving a list.
 */

import { filterParams, type ClearOutFilter } from "@/lib/clearout/filters";

export type NavId = "home" | "cleanup" | "unsubscribed" | "settings";

export type NavItem = {
  id: NavId;
  /** Path in the real app. The demo prefixes it with /demo. */
  href: string;
  label: string;
};

export const NAV: NavItem[] = [
  { id: "home", href: "/dashboard", label: "Home" },
  { id: "cleanup", href: "/cleanup", label: "Cleanup" },
  { id: "unsubscribed", href: "/unsubscribed", label: "Unsubscribed" },
  { id: "settings", href: "/settings", label: "Settings" },
];

/** The demo has no mailbox to configure, so it drops Settings. */
export const DEMO_NAV: NavItem[] = NAV.filter((item) => item.id !== "settings");

/**
 * Unsubscribe outcomes that are not confirmed: a request that was only sent,
 * one waiting on a click, and one that failed. They are not in the
 * Unsubscribed archive; Cleanup's To review view filters to each of them.
 */
export const UNCONFIRMED_STATUSES = ["REQUESTED", "MANUAL", "FAILED"] as const;
export type UnconfirmedStatus = (typeof UNCONFIRMED_STATUSES)[number];

/** A ?status= value naming an unconfirmed outcome, or null. */
export function unconfirmedStatus(value: string | null | undefined): UnconfirmedStatus | null {
  return (UNCONFIRMED_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as UnconfirmedStatus)
    : null;
}

/** Cleanup's two views. To review is the default and has no URL parameter. */
export type CleanupView = "review" | "keeping";

export function cleanupView(value: string | null | undefined): CleanupView {
  return value === "keeping" ? "keeping" : "review";
}

/**
 * Where a sender lives in Cleanup — the list, and the follow-up filter that
 * shows it — or null when neither list holds it (already unsubscribed, or
 * retired). Used to open a sender named by an old Clear out link.
 */
export function senderPlace(status: string): { view: CleanupView; status: UnconfirmedStatus | null } | null {
  if (status === "KEPT") return { view: "keeping", status: null };
  if (status === "ACTIVE") return { view: "review", status: null };
  const outcome = unconfirmedStatus(status);
  return outcome ? { view: "review", status: outcome } : null;
}

/**
 * A link into Cleanup.
 *
 *   /cleanup                     To review, senders waiting for a decision
 *   /cleanup?status=MANUAL       To review, filtered to one unconfirmed outcome
 *   /cleanup?view=keeping        Keeping
 *   /cleanup?mail=all            All emails: the whole mailbox, not one sender
 *   /cleanup?review=<sender id>  Review one confirmed unsubscribe (from Unsubscribed)
 *   /cleanup?unread=1&older=6m   The message filters (see clearout/filters.ts)
 *
 * The message filters ride along in the same query, so changing the list of
 * senders never throws away what the message pane was narrowed to.
 */
export function cleanupHref(
  basePath: string,
  options: {
    view?: CleanupView;
    status?: UnconfirmedStatus | null;
    search?: string | null;
    /** Show every email in the mailbox instead of one sender's. */
    all?: boolean;
    /** A confirmed unsubscribe to review, from "Review in Cleanup". */
    review?: string | null;
    filter?: ClearOutFilter;
  } = {},
): string {
  const params = new URLSearchParams();
  if (options.view === "keeping") params.set("view", "keeping");
  else if (options.status) params.set("status", options.status);
  if (options.search) params.set("search", options.search);
  if (options.all) params.set("mail", "all");
  if (options.review) params.set("review", options.review);
  if (options.filter) {
    for (const [key, value] of filterParams(options.filter)) params.append(key, value);
  }
  const query = params.toString();
  return `${basePath}/cleanup${query ? `?${query}` : ""}`;
}

/** What Cleanup itself keeps in the query; everything else belongs to the message filters. */
const CLEANUP_PARAMS = ["view", "status", "search", "review", "mail"];

/**
 * Where an old /clear-out link now goes.
 *
 * Clear out's filters (?from=…&older=6m&unread=1&q=…&scope=…&label=…) are the
 * message filters of the unified Cleanup, under the same names, so they carry
 * over as they are — and so do the parameters a returning Google permission
 * trip adds (?access=…&mailbox=…). Cleanup's own parameters are dropped: an
 * old link never had them, and a stray one must not choose a different list.
 *
 * Clear out showed the whole mailbox, so a link without exactly one sender
 * opens All emails. A link naming one sender opens that sender when Cleanup
 * knows it, and falls back to All emails filtered to that address.
 */
export function clearOutRedirect(
  basePath: string,
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (CLEANUP_PARAMS.includes(key) || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) query.append(key, entry);
  }
  if (query.getAll("from").length !== 1) query.set("mail", "all");
  const text = query.toString();
  return `${basePath}/cleanup${text ? `?${text}` : ""}`;
}

/**
 * Where an old /senders link now goes, keeping whatever context it carried.
 *
 * An unconfirmed outcome opens that filter in To review, undecided senders
 * open To review, confirmed unsubscribes open the archive, and everything
 * else — the plain page, kept senders, "All", a search — opens Keeping.
 */
export function sendersRedirect(
  basePath: string,
  params: { status?: string | null; search?: string | null },
): string {
  const outcome = unconfirmedStatus(params.status);
  if (outcome) return cleanupHref(basePath, { status: outcome });
  if (params.status === "ACTIVE") return cleanupHref(basePath, { search: params.search });
  if (params.status === "UNSUBSCRIBED") return `${basePath}/unsubscribed`;
  return cleanupHref(basePath, { view: "keeping", search: params.search });
}

/**
 * Home and Cleanup share the header layout — no sidebar, white glass surfaces.
 * Every other screen keeps the sidebar.
 */
export function usesHomeShell(pathname: string, basePath = ""): boolean {
  return pathname === navHref(NAV[0], basePath) || pathname === navHref(NAV[1], basePath);
}

/** Where a nav item points, given the base the screens are mounted under. */
export function navHref(item: NavItem, basePath = ""): string {
  if (!basePath) return item.href;
  return item.id === "home" ? basePath : `${basePath}${item.href}`;
}
