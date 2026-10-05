/**
 * Mailbox rules shared by the server, the browser and the demo.
 *
 * A Tidely profile can connect several Gmail mailboxes. Exactly one is active
 * in a browser tab at a time, and every request that reads or changes mail
 * names its mailbox in the `X-Tidely-Mailbox` header. The server checks that
 * the mailbox belongs to the signed-in person before doing anything, so a
 * request started in one mailbox can never act on another — even when a
 * second tab has switched, or a response arrives late.
 *
 * Pure and dependency-free so tests, route handlers and client components
 * all import the same definitions.
 */

/** The request header naming the mailbox a request is about. */
export const MAILBOX_HEADER = "x-tidely-mailbox";

/** Query parameter a redirect uses to select a mailbox in the returning tab. */
export const MAILBOX_PARAM = "mailbox";
/** Query parameters carrying the outcome of adding or reconnecting a mailbox. */
export const MAILBOX_STATUS_PARAM = "mailbox_status";
export const MAILBOX_ERROR_PARAM = "mailbox_error";

/** Error code the API returns when a named mailbox is not the caller's (any more). */
export const MAILBOX_NOT_FOUND = "mailbox_not_found";
/** Error code for a change that did not say which mailbox it is for. */
export const MAILBOX_REQUIRED = "mailbox_required";
/** Error code when the mailbox's Google grant has stopped working. */
export const MAILBOX_RECONNECT = "mailbox_reconnect";

/** Longest name a person can give a mailbox. */
export const MAILBOX_LABEL_MAX = 32;

/** Mailbox ids are UUIDs here and short slugs in the demo. Nothing else is accepted. */
export function isMailboxId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

/**
 * A person-chosen mailbox name, tidied: trimmed, inner whitespace collapsed,
 * control characters dropped. Empty means "no name". Too long is an error the
 * caller reports, rather than a silent cut.
 */
export function normaliseMailboxLabel(
  value: unknown,
): { ok: true; label: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined) return { ok: true, label: null };
  if (typeof value !== "string") return { ok: false, error: "A mailbox name must be text." };
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return { ok: true, label: null };
  if ([...cleaned].length > MAILBOX_LABEL_MAX) {
    return { ok: false, error: `Keep the name to ${MAILBOX_LABEL_MAX} characters or fewer.` };
  }
  return { ok: true, label: cleaned };
}

/**
 * Starts Google's consent again for one particular mailbox. The server checks
 * that the person comes back as that same Google account.
 */
export function reconnectHref(
  mailboxId: string,
  options: { next?: string | null; organise?: boolean } = {},
): string {
  const params = new URLSearchParams({ mode: "reconnect", [MAILBOX_PARAM]: mailboxId });
  if (options.organise) params.set("access", "organise");
  if (options.next) params.set("next", options.next);
  return `/api/auth/google/start?${params}`;
}

/** The explainer page before connecting another Gmail, returning to `next` afterwards. */
export function addMailboxHref(next?: string | null): string {
  const params = new URLSearchParams({ add: "1" });
  if (next) params.set("next", next);
  return `/connect?${params}`;
}

/** What a mailbox is called in the interface: its name if it has one, otherwise its address. */
export function mailboxTitle(mailbox: { label: string | null; email: string }): string {
  return mailbox.label ?? mailbox.email;
}

/**
 * Which mailbox a tab should open on.
 *
 * In order: one the URL asked for (the return from adding a mailbox), the one
 * this tab was already using, the one last chosen on any device, and finally
 * the first connected. Each candidate counts only if it is still connected.
 */
export function pickActiveMailbox(
  mailboxIds: string[],
  candidates: { fromUrl?: string | null; fromTab?: string | null; remembered?: string | null },
): string | null {
  for (const candidate of [candidates.fromUrl, candidates.fromTab, candidates.remembered]) {
    if (candidate && mailboxIds.includes(candidate)) return candidate;
  }
  return mailboxIds[0] ?? null;
}

/**
 * Query parameters that point at something inside one mailbox — a sender
 * under review, the outcome of a permission request — and so must not
 * survive a switch to a different mailbox. Filters such as a search or
 * "older than six months" mean the same thing in every mailbox and stay.
 */
export const MAILBOX_SPECIFIC_PARAMS = ["review", "senderId", "access"] as const;

const MAILBOX_ERRORS = {
  cancelled: "Google sign-in was cancelled, so no mailbox was added. You can try again whenever you’re ready.",
  wrong_account: "That was a different Google account. Choose the account for this mailbox and try again.",
  missing_permissions:
    "Google didn’t grant access to Gmail, so the mailbox wasn’t connected. Tick the Gmail permissions when Google asks.",
  not_found: "That mailbox is no longer connected to your account.",
  expired: "That took too long. Please try again.",
  unavailable: "Google sign-in is temporarily unavailable. Please try again later.",
  failed: "The mailbox couldn’t be connected. Please try again.",
} as const;

export type MailboxError = keyof typeof MAILBOX_ERRORS;

export function mailboxErrorMessage(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return Object.hasOwn(MAILBOX_ERRORS, value)
    ? MAILBOX_ERRORS[value as MailboxError]
    : MAILBOX_ERRORS.failed;
}

const MAILBOX_STATUSES = {
  added: "Mailbox connected.",
  already_connected: "That mailbox was already connected — its access has been refreshed.",
  reconnected: "Mailbox reconnected.",
} as const;

export type MailboxStatus = keyof typeof MAILBOX_STATUSES;

export function mailboxStatusMessage(value: unknown): string | null {
  if (typeof value !== "string" || !Object.hasOwn(MAILBOX_STATUSES, value)) return null;
  return MAILBOX_STATUSES[value as MailboxStatus];
}
