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
 * Each page has one job: Home is the overview, Cleanup decides which mailing
 * lists to keep or leave, Clear out organises mail already in the mailbox,
 * and Unsubscribed reviews what happened after leaving a list.
 */

export type NavId = "home" | "cleanup" | "clearout" | "unsubscribed" | "settings";

export type NavItem = {
  id: NavId;
  /** Path in the real app. The demo prefixes it with /demo. */
  href: string;
  label: string;
};

export const NAV: NavItem[] = [
  { id: "home", href: "/dashboard", label: "Home" },
  { id: "cleanup", href: "/cleanup", label: "Cleanup" },
  { id: "clearout", href: "/clear-out", label: "Clear out" },
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
 * A link into Cleanup.
 *
 *   /cleanup                     To review, senders waiting for a decision
 *   /cleanup?status=MANUAL       To review, filtered to one unconfirmed outcome
 *   /cleanup?view=keeping        Keeping
 */
export function cleanupHref(
  basePath: string,
  options: { view?: CleanupView; status?: UnconfirmedStatus | null; search?: string | null } = {},
): string {
  const params = new URLSearchParams();
  if (options.view === "keeping") params.set("view", "keeping");
  else if (options.status) params.set("status", options.status);
  if (options.search) params.set("search", options.search);
  const query = params.toString();
  return `${basePath}/cleanup${query ? `?${query}` : ""}`;
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

/** Where a nav item points, given the base the screens are mounted under. */
export function navHref(item: NavItem, basePath = ""): string {
  if (!basePath) return item.href;
  return item.id === "home" ? basePath : `${basePath}${item.href}`;
}
