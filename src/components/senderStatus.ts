import type { BadgeTone } from "./ui/Badge";
import { SENDER_STATUS, type SenderStatus } from "@/lib/constants";

/**
 * How each status is worded and coloured.
 *
 * Presentation only — one table so the wording is consistent everywhere and
 * easy to change (or translate) in a single place.
 */

export const STATUS_LABEL: Record<SenderStatus, string> = {
  [SENDER_STATUS.ACTIVE]: "Subscribed",
  [SENDER_STATUS.KEPT]: "Keeping",
  [SENDER_STATUS.ROLLED_UP]: "Rolled up",
  [SENDER_STATUS.UNSUBSCRIBING]: "Working…",
  [SENDER_STATUS.UNSUBSCRIBED]: "Unsubscribed",
  [SENDER_STATUS.REQUESTED]: "Request sent",
  [SENDER_STATUS.FAILED]: "Failed",
  [SENDER_STATUS.MANUAL]: "Needs a click",
};

export const STATUS_TONE: Record<SenderStatus, BadgeTone> = {
  [SENDER_STATUS.ACTIVE]: "neutral",
  [SENDER_STATUS.KEPT]: "success",
  [SENDER_STATUS.ROLLED_UP]: "info",
  [SENDER_STATUS.UNSUBSCRIBING]: "info",
  [SENDER_STATUS.UNSUBSCRIBED]: "success",
  [SENDER_STATUS.REQUESTED]: "info",
  [SENDER_STATUS.FAILED]: "danger",
  [SENDER_STATUS.MANUAL]: "warning",
};

/** Human wording for the filter tabs. */
export const FILTER_LABEL: Record<SenderStatus | "ALL", string> = {
  ALL: "All",
  [SENDER_STATUS.ACTIVE]: "Subscriptions",
  [SENDER_STATUS.KEPT]: "Keeping",
  [SENDER_STATUS.ROLLED_UP]: "Rollups",
  [SENDER_STATUS.UNSUBSCRIBING]: "In progress",
  [SENDER_STATUS.UNSUBSCRIBED]: "Unsubscribed",
  [SENDER_STATUS.REQUESTED]: "Requests sent",
  [SENDER_STATUS.FAILED]: "Failed",
  [SENDER_STATUS.MANUAL]: "Needs a click",
};

export function formatRelativeDate(iso: string | null): string {
  if (!iso) return "—";

  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** 13320 -> "3h 42m". Used by the Time saved stat. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** "Good morning" / "Good afternoon" / "Good evening", in the viewer's time. */
export function greetingFor(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
