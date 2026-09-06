import "server-only";
import { and, eq, gte, lt, count, sum } from "drizzle-orm";
import { db } from "@/db";
import { senders } from "@/db/schema";
import { SECONDS_SAVED_PER_EMAIL, SENDER_STATUS } from "@/lib/constants";
import type { StatsDto } from "./types";

/**
 * The three numbers on the Home screen.
 *
 * Every figure here is computed from real rows — none of it is decorative.
 * The two assumptions it makes are stated in the code rather than hidden:
 * what counts as "handled", and how much time one unwanted email costs you.
 */

/** The window the "this month" deltas look back over. */
const RECENT_WINDOW_DAYS = 30;

/** Statuses that mean the user has made a decision about a sender. */
const DECIDED = [
  SENDER_STATUS.REQUESTED,
  SENDER_STATUS.KEPT,
  SENDER_STATUS.ROLLED_UP,
  SENDER_STATUS.UNSUBSCRIBED,
] as const;

/** Statuses that mean mail actually stops arriving one-by-one. */
const SILENCED = [SENDER_STATUS.UNSUBSCRIBED, SENDER_STATUS.ROLLED_UP] as const;

export async function computeStats(mailAccountId: string): Promise<StatsDto> {
  const now = Date.now();
  const cutoff = new Date(now - RECENT_WINDOW_DAYS * 86_400_000);
  const previousCutoff = new Date(now - RECENT_WINDOW_DAYS * 2 * 86_400_000);

  const byStatus = await db
    .select({
      status: senders.status,
      senderCount: count(),
      volume: sum(senders.messageCount).mapWith(Number),
    })
    .from(senders)
    .where(eq(senders.mailAccountId, mailAccountId))
    .groupBy(senders.status);

  const recentByStatus = await db
    .select({
      status: senders.status,
      senderCount: count(),
      volume: sum(senders.messageCount).mapWith(Number),
    })
    .from(senders)
    .where(
      and(
        eq(senders.mailAccountId, mailAccountId),
        gte(senders.decidedAt, cutoff),
      ),
    )
    .groupBy(senders.status);

  const previousByStatus = await db
    .select({
      status: senders.status,
      senderCount: count(),
      volume: sum(senders.messageCount).mapWith(Number),
    })
    .from(senders)
    .where(
      and(
        eq(senders.mailAccountId, mailAccountId),
        gte(senders.decidedAt, previousCutoff),
        lt(senders.decidedAt, cutoff),
      ),
    )
    .groupBy(senders.status);

  const volumeOf = (
    rows: typeof byStatus,
    statuses: readonly string[],
  ): number =>
    rows
      .filter((row) => statuses.includes(row.status))
      .reduce((total, row) => total + (row.volume ?? 0), 0);

  const countOf = (rows: typeof byStatus, statuses: readonly string[]): number =>
    rows
      .filter((row) => statuses.includes(row.status))
      .reduce((total, row) => total + row.senderCount, 0);

  const totalVolume = byStatus.reduce((t, row) => t + (row.volume ?? 0), 0);
  const totalSenders = byStatus.reduce((t, row) => t + row.senderCount, 0);

  const decidedVolume = volumeOf(byStatus, DECIDED);
  const silencedVolume = volumeOf(byStatus, SILENCED);
  const recentSilencedVolume = volumeOf(recentByStatus, SILENCED);
  const recentDecidedVolume = volumeOf(recentByStatus, DECIDED);
  const previousDecidedVolume = volumeOf(previousByStatus, DECIDED);

  /**
   * Inbox health is the share of your subscription volume you have made a
   * decision about — kept, rolled up, requested removal or unsubscribed. An untouched mailbox
   * scores low; one where every newsletter has been triaged scores 100.
   * A mailbox with no subscriptions at all is, correctly, already healthy.
   */
  const inboxHealth =
    totalVolume === 0 ? 100 : Math.round((decidedVolume / totalVolume) * 100);

  return {
    inboxHealth,
    handledThisMonth: countOf(recentByStatus, DECIDED),
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
    activeSenders: countOf(byStatus, [SENDER_STATUS.ACTIVE]),
    activeVolume: volumeOf(byStatus, [SENDER_STATUS.ACTIVE]),
  };
}
