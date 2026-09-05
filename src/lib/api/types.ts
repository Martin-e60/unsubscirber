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

export type SessionDto = {
  user: UserDto | null;
  account: MailAccountDto | null;
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

export type ApiError = { error: string };

/** Sorting options offered by GET /api/senders. */
export type SenderSort = "count" | "recent" | "name";
