/**
 * Status values used across the app.
 *
 * SQLite has no enum type, so these live here as TypeScript unions and are the
 * single source of truth. Import these instead of typing string literals.
 */

export const SENDER_STATUS = {
  /** Found by a scan, no decision made yet. */
  ACTIVE: "ACTIVE",
  /** User chose to keep receiving this. Hidden from the main list. */
  KEPT: "KEPT",
  /**
   * User wants this bundled into a periodic digest instead of arriving one
   * message at a time. The sender is marked; sending the digest itself is not
   * built yet — see README, "Not built yet".
   */
  ROLLED_UP: "ROLLED_UP",
  /** An unsubscribe request is in flight. */
  UNSUBSCRIBING: "UNSUBSCRIBING",
  /** Unsubscribe completed successfully. */
  UNSUBSCRIBED: "UNSUBSCRIBED",
  /** Every available method failed. */
  FAILED: "FAILED",
  /** We can't finish it automatically — the user has to open a link. */
  MANUAL: "MANUAL",
} as const;

export type SenderStatus = (typeof SENDER_STATUS)[keyof typeof SENDER_STATUS];

export const SCAN_STATUS = {
  RUNNING: "RUNNING",
  DONE: "DONE",
  ERROR: "ERROR",
  CANCELLED: "CANCELLED",
} as const;

export type ScanStatus = (typeof SCAN_STATUS)[keyof typeof SCAN_STATUS];

export const UNSUBSCRIBE_METHOD = {
  /** RFC 8058 one-click: a single POST, no user interaction. Most reliable. */
  ONE_CLICK: "ONE_CLICK",
  /** A plain https URL from the List-Unsubscribe header. */
  HTTP: "HTTP",
  /** A mailto: address from List-Unsubscribe. We send the email for you. */
  MAILTO: "MAILTO",
  /** A link scraped out of the message body when no header exists. */
  BODY_LINK: "BODY_LINK",
} as const;

export type UnsubscribeMethod =
  (typeof UNSUBSCRIBE_METHOD)[keyof typeof UNSUBSCRIBE_METHOD];

export const ATTEMPT_STATUS = {
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  MANUAL_REQUIRED: "MANUAL_REQUIRED",
} as const;

export type AttemptStatus = (typeof ATTEMPT_STATUS)[keyof typeof ATTEMPT_STATUS];

/** How many messages one scan chunk pulls from the provider. */
export const SCAN_PAGE_SIZE = 100;

/** How many message metadata requests run in parallel inside a chunk. */
export const SCAN_CONCURRENCY = 12;

/**
 * Seconds assumed saved per email you no longer receive.
 *
 * Used only for the "Time saved" stat. Noticing, opening and dismissing a
 * marketing email is a few seconds of attention; five is a deliberately
 * conservative figure. Change it here and the stat follows.
 */
export const SECONDS_SAVED_PER_EMAIL = 5;

/** How many senders the Quick cleanup panel suggests at once. */
export const QUICK_CLEANUP_SIZE = 8;

/** Lookback options offered in the UI, in days. */
export const LOOKBACK_OPTIONS = [30, 90, 180, 365, 1095] as const;

/**
 * The account used by `npm run db:seed` and by the development-only sign-in.
 *
 * Both refer to this one address so that clicking "Skip sign-in" lands you in
 * the seeded mailbox rather than an empty one.
 */
export const DEV_USER_EMAIL = "michael.k@example.com";
export const DEV_USER_NAME = "Michael Kowalski";

/** Session cookie name. */
export const SESSION_COOKIE = "unsub_session";

/** How long a login lasts. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Google OAuth scopes.
 *
 * - gmail.readonly  reads message headers to find subscriptions
 * - gmail.send      sends mailto: unsubscribe requests on your behalf
 * - userinfo.email  identifies which mailbox was connected
 */
export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];
