import { SECONDS_SAVED_PER_EMAIL, SENDER_STATUS } from "@/lib/constants";
import type { StatsDto } from "@/lib/api/types";

/**
 * The arithmetic behind the Home screen's numbers.
 *
 * Kept as a pure function, separate from the queries that feed it, for two
 * reasons: it is the part worth testing, and the public demo has to produce the
 * same figures from its own in-browser data. One implementation means the demo
 * cannot quietly flatter the app with maths the real thing does not do.
 *
 * Both assumptions are stated rather than hidden: what counts as a decision,
 * and what counts as mail that actually stopped arriving.
 */

/** The window the "this month" deltas look back over. */
export const RECENT_WINDOW_DAYS = 30;

/** Statuses that mean the user has made a decision about a sender. */
export const DECIDED = [
  SENDER_STATUS.REQUESTED,
  SENDER_STATUS.KEPT,
  SENDER_STATUS.ROLLED_UP,
  SENDER_STATUS.UNSUBSCRIBED,
] as const;

/**
 * Statuses that mean mail actually stops arriving.
 *
 * Only a confirmed unsubscribe qualifies. A rolled-up sender is *not* here:
 * marking one changes nothing about how its mail arrives, because the digest
 * that would replace it was never built. Counting it as time saved would be
 * inventing a benefit the app does not deliver.
 */
export const SILENCED = [SENDER_STATUS.UNSUBSCRIBED] as const;

/** One row of a group-by: how many senders sit in a status, and their volume. */
export type StatusVolume = {
  status: string;
  senderCount: number;
  volume: number | null;
};

export type StatsInput = {
  /** Every sender on the mailbox. */
  all: StatusVolume[];
  /** Senders decided inside the recent window. */
  recent: StatusVolume[];
  /** Senders decided in the window before that. */
  previous: StatusVolume[];
};

export function summariseStats({ all, recent, previous }: StatsInput): StatsDto {
  const volumeOf = (rows: StatusVolume[], statuses: readonly string[]): number =>
    rows
      .filter((row) => statuses.includes(row.status))
      .reduce((total, row) => total + (row.volume ?? 0), 0);

  const countOf = (rows: StatusVolume[], statuses: readonly string[]): number =>
    rows
      .filter((row) => statuses.includes(row.status))
      .reduce((total, row) => total + row.senderCount, 0);

  const totalVolume = all.reduce((t, row) => t + (row.volume ?? 0), 0);
  const totalSenders = all.reduce((t, row) => t + row.senderCount, 0);

  const decidedVolume = volumeOf(all, DECIDED);
  const silencedVolume = volumeOf(all, SILENCED);
  const recentSilencedVolume = volumeOf(recent, SILENCED);
  const recentDecidedVolume = volumeOf(recent, DECIDED);
  const previousDecidedVolume = volumeOf(previous, DECIDED);

  /**
   * Inbox health is the share of your subscription volume you have made a
   * decision about — kept, rolled up, requested removal or unsubscribed. An
   * untouched mailbox scores low; one where every newsletter has been triaged
   * scores 100. A mailbox with no subscriptions at all is, correctly, already
   * healthy. It is an estimate of triage progress, not a measure of your
   * mailbox's quality, and the app says so where it is shown.
   */
  const inboxHealth =
    totalVolume === 0 ? 100 : Math.round((decidedVolume / totalVolume) * 100);

  return {
    inboxHealth,
    handledThisMonth: countOf(recent, DECIDED),
    emailsHandled: decidedVolume,
    emailsHandledDeltaPct:
      previousDecidedVolume === 0
        ? null
        : Math.round(
            ((recentDecidedVolume - previousDecidedVolume) / previousDecidedVolume) *
              100,
          ),
    timeSavedSeconds: silencedVolume * SECONDS_SAVED_PER_EMAIL,
    timeSavedRecentSeconds: recentSilencedVolume * SECONDS_SAVED_PER_EMAIL,
    totalSenders,
    activeSenders: countOf(all, [SENDER_STATUS.ACTIVE]),
    activeVolume: volumeOf(all, [SENDER_STATUS.ACTIVE]),
  };
}
