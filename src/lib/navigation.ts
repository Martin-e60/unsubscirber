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
 */

export type NavId = "home" | "cleanup" | "senders" | "unsubscribed" | "settings";

export type NavItem = {
  id: NavId;
  /** Path in the real app. The demo prefixes it with /demo. */
  href: string;
  label: string;
};

export const NAV: NavItem[] = [
  { id: "home", href: "/dashboard", label: "Home" },
  { id: "cleanup", href: "/cleanup", label: "Cleanup" },
  { id: "senders", href: "/senders", label: "Senders" },
  { id: "unsubscribed", href: "/unsubscribed", label: "Unsubscribed" },
  { id: "settings", href: "/settings", label: "Settings" },
];

/** The demo has no mailbox to configure, so it drops Settings. */
export const DEMO_NAV: NavItem[] = NAV.filter((item) => item.id !== "settings");

/**
 * Unsubscribe outcomes that are not confirmed. They are listed in Senders,
 * under their own status, rather than in the Unsubscribed archive.
 */
export const UNCONFIRMED_STATUSES = ["REQUESTED", "MANUAL", "FAILED"] as const;
export type UnconfirmedStatus = (typeof UNCONFIRMED_STATUSES)[number];

/** A ?status= value naming an unconfirmed outcome, or null. */
export function unconfirmedStatus(value: string | undefined): UnconfirmedStatus | null {
  return (UNCONFIRMED_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as UnconfirmedStatus)
    : null;
}

/** Filters the Senders page accepts in ?status=. */
const SENDER_FILTERS = ["ALL", "ACTIVE", "KEPT", "UNSUBSCRIBED", ...UNCONFIRMED_STATUSES] as const;
export type SenderFilterParam = (typeof SENDER_FILTERS)[number];

export function senderFilter(value: string | undefined): SenderFilterParam {
  return (SENDER_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as SenderFilterParam)
    : "ALL";
}

/** Where a nav item points, given the base the screens are mounted under. */
export function navHref(item: NavItem, basePath = ""): string {
  if (!basePath) return item.href;
  return item.id === "home" ? basePath : `${basePath}${item.href}`;
}
