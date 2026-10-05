/**
 * The contract between the server and the browser.
 *
 * Both sides import these types, so a change to an API response immediately
 * shows up as a type error in the component that reads it. Dates cross the
 * wire as ISO strings, never as Date objects.
 */

import type { SenderStatus, ScanStatus, UnsubscribeMethod } from "@/lib/constants";

export type UserDto = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

export type MailAccountDto = {
  id: string;
  email: string;
  provider: string;
};

/** One connected mailbox, as the switcher and Settings show it. */
export type MailboxDto = MailAccountDto & {
  /** A name the person gave it, e.g. "Work"; null when they gave none. */
  label: string | null;
  /** Google stopped accepting the stored grant; a reconnect fixes it. */
  needsReconnect: boolean;
  /** Clear out's organise permission has been granted for this mailbox. */
  canOrganise: boolean;
  /** ISO timestamp. */
  connectedAt: string;
};

export type SessionDto = {
  user: UserDto | null;
  /** Every connected mailbox, oldest first. Empty when none is connected. */
  mailboxes: MailboxDto[];
  /**
   * The mailbox last chosen on any device, or the newest one. Only where a
   * tab starts: each tab then keeps its own choice.
   */
  activeMailboxId: string | null;
  /** That same mailbox, for screens that only ever need one. */
  account: MailAccountDto | null;
};

export type MailboxesResponse = {
  mailboxes: MailboxDto[];
  activeMailboxId: string | null;
};

export type SenderDto = {
  id: string;
  address: string;
  name: string | null;
  messageCount: number;
  /** Average emails per month over the span we have seen, rounded. */
  perMonth: number;
  /** ISO date string, or null if unknown. */
  lastSeenAt: string | null;
  /** ISO date of the earliest message seen, or null if unknown. */
  firstSeenAt: string | null;
  sampleSubject: string | null;
  status: SenderStatus;
  /** True when we can unsubscribe with a single POST and no user action. */
  canOneClick: boolean;
  /** True when some unsubscribe route exists at all. */
  canUnsubscribe: boolean;
  /** Set once an attempt has left the user a link to finish manually. */
  manualUrl: string | null;
};

export type SenderCountsDto = Record<SenderStatus, number>;

export type SendersResponse = {
  senders: SenderDto[];
  counts: SenderCountsDto;
  total: number;
};

export type ScanProgressDto = {
  scanId: string;
  status: ScanStatus;
  processedMessages: number;
  matchedMessages: number;
  foundSenders: number;
  totalEstimate: number;
  fraction: number;
  done: boolean;
  error: string | null;
  /** How far back this scan looked, in days. */
  lookbackDays: number;
  /** ISO timestamps; finishedAt is null while the scan is still running. */
  startedAt: string | null;
  finishedAt: string | null;
};

export type UnsubscribeResultDto = {
  senderId: string;
  status: SenderStatus;
  method: UnsubscribeMethod | null;
  manualUrl: string | null;
  detail: string;
};

export type StatsDto = {
  /** 0–100: the share of subscription volume you have made a decision about. */
  inboxHealth: number;
  /** Senders decided in the last 30 days. */
  handledThisMonth: number;
  /** Total emails from senders you have decided about. */
  emailsHandled: number;
  /**
   * Percentage change in emails handled, last 30 days against the 30 before
   * that. Null when there is no earlier period to compare against.
   */
  emailsHandledDeltaPct: number | null;
  /** Estimated seconds saved by mail that no longer arrives one-by-one. */
  timeSavedSeconds: number;
  timeSavedRecentSeconds: number;

  totalSenders: number;
  activeSenders: number;
  activeVolume: number;

  /** Senders whose removal the sender itself confirmed. Nothing else counts. */
  confirmedUnsubscribes: number;
  /**
   * Estimated emails per month that no longer arrive, from how often each
   * confirmed-removed sender wrote before. Null until there is at least one
   * confirmed removal to base it on.
   */
  fewerEmailsPerMonth: number | null;
  /** fewerEmailsPerMonth × SECONDS_SAVED_PER_EMAIL. Null when that is null. */
  timeSavedPerMonthSeconds: number | null;
  /** Senders whose unsubscribe needs one more click from the user. */
  needsClick: number;
  /** Senders whose unsubscribe attempt failed. */
  failed: number;
};

export type HistoryItemDto = {
  id: string;
  senderId: string;
  senderAddress: string;
  senderName: string | null;
  method: UnsubscribeMethod;
  status: string;
  detail: string | null;
  createdAt: string;
};

/** A message that arrived after a confirmed unsubscribe. */
export type FollowUpMessageDto = {
  id: string;
  /** Null when no subject was recorded. */
  subject: string | null;
  /** When the mailbox received it — never when a scan found it. */
  receivedAt: string;
  /** Opens this message in Gmail, or null where no reliable link exists. */
  gmailUrl: string | null;
};

/** One confirmed unsubscribe in the archive, with what has been seen since. */
export type ArchiveItemDto = {
  senderId: string;
  name: string | null;
  address: string;
  /** When the unsubscribe was confirmed. Null for old records without one. */
  unsubscribedAt: string | null;
  observation: "NEW_MAIL" | "NO_NEW_MAIL" | "NOT_CHECKED";
  notCheckedReason: "NO_DATE" | "NO_CHECK" | "TOO_SOON" | null;
  matchedBy: "LIST_ID" | "ADDRESS";
  /** Newest first, capped; `newCount` has the full number. */
  newMessages: FollowUpMessageDto[];
  newCount: number;
  check: {
    at: string;
    from: string;
    to: string;
    partial: boolean;
    found: number;
  } | null;
  /** The sender's own unsubscribe page (https only), for doing it by hand. */
  unsubscribePageUrl: string | null;
};

export type UnsubscribedResponse = {
  items: ArchiveItemDto[];
  /** Matching the search. */
  total: number;
  /** Every confirmed unsubscribe, whatever the search. */
  archiveTotal: number;
  /** The latest scan that finished. Failed or stopped scans never count. */
  lastCheck: { finishedAt: string; lookbackDays: number } | null;
  /** The period "Check again" scans so it reaches the oldest unsubscribe. */
  checkLookbackDays: number;
};

/** `code` is a stable machine-readable reason, set for the cases a screen reacts to. */
export type ApiError = { error: string; code?: string };

/** Sorting options offered by GET /api/senders. */
export type SenderSort = "count" | "recent" | "name";

// --- Clear out ------------------------------------------------------------------

export type ClearOutLabelDto = { id: string; name: string };

/** One message in Clear out's list. One row is one message, never a thread. */
export type ClearOutMessageDto = {
  id: string;
  threadId: string;
  fromName: string | null;
  fromAddress: string;
  /** Recipients as written, for sent mail and the preview. */
  to: string | null;
  /** True for mail the connected address sent. */
  sentByMe: boolean;
  subject: string | null;
  /** Gmail's own short excerpt. Shown, never stored. */
  snippet: string;
  receivedAt: string | null;
  unread: boolean;
  inInbox: boolean;
  /**
   * True when the message has attachments. From Gmail search when the
   * attachments filter is on; otherwise from a multipart/mixed Content-Type,
   * which is how mail with attachments is built.
   */
  hasAttachment: boolean;
  sizeBytes: number | null;
  /** The person's own labels on it, not system ones. */
  labels: ClearOutLabelDto[];
  /** Opens it in Gmail, or null where there is nothing real to open. */
  gmailUrl: string | null;
};

export type ClearOutPreviewDto = ClearOutMessageDto & {
  cc: string | null;
};

export type ClearOutListResponse = {
  messages: ClearOutMessageDto[];
  nextPageToken: string | null;
  /** Gmail gives an estimate; the demo knows exactly. */
  total: number;
  totalExact: boolean;
  /** Plain-language caveats about this result, e.g. a filter that was capped. */
  notes: string[];
};

export type ClearOutAccessDto = {
  /** Can search and read message details. */
  canRead: boolean;
  /** Can archive, trash, label and mark as read. */
  canOrganise: boolean;
  /** Where to ask for the missing permission, or null if none is missing. */
  grantUrl: string | null;
};

export type SenderSuggestionDto = {
  name: string | null;
  address: string;
};

export type ClearOutResolveResponse = {
  ids: string[];
  nextPageToken: string | null;
  estimate: number;
};

export type ClearOutRunDto = {
  id: string;
  action: "mark_read" | "label" | "archive" | "trash";
  labelName: string | null;
  /** How many emails were in the reviewed selection. */
  requested: number;
  /** Confirmed by Gmail. */
  succeeded: number;
  /** Still failed after any retries. */
  failed: number;
  createdAt: string;
  updatedAt: string;
};

export type ClearOutChunkResponse = {
  run: ClearOutRunDto;
  succeeded: string[];
  failed: string[];
};
