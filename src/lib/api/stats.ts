import "server-only";
import { and, eq, gte, lt, count, sum } from "drizzle-orm";
import { db } from "@/db";
import { senders } from "@/db/schema";
import { SENDER_STATUS } from "@/lib/constants";
import { RECENT_WINDOW_DAYS, summariseStats } from "@/lib/stats/summarise";
import type { StatsDto } from "./types";

/**
 * The three numbers on the Home screen.
 *
 * Every figure is computed from real rows — none of it is decorative. This file
 * only asks the database three questions; the arithmetic, and the assumptions
 * behind it, live in src/lib/stats/summarise.ts so the demo can reuse them.
 */

export async function computeStats(mailAccountId: string): Promise<StatsDto> {
  const now = Date.now();
  const cutoff = new Date(now - RECENT_WINDOW_DAYS * 86_400_000);
  const previousCutoff = new Date(now - RECENT_WINDOW_DAYS * 2 * 86_400_000);

  const groupBy = (extra?: ReturnType<typeof and>) =>
    db
      .select({
        status: senders.status,
        senderCount: count(),
        volume: sum(senders.messageCount).mapWith(Number),
      })
      .from(senders)
      .where(extra ? and(eq(senders.mailAccountId, mailAccountId), extra) : eq(senders.mailAccountId, mailAccountId))
      .groupBy(senders.status);

  const [all, recent, previous, confirmed] = await Promise.all([
    groupBy(),
    groupBy(and(gte(senders.decidedAt, cutoff))),
    groupBy(and(gte(senders.decidedAt, previousCutoff), lt(senders.decidedAt, cutoff))),
    // Only confirmed removals feed the "fewer emails" estimate.
    db
      .select({
        messageCount: senders.messageCount,
        firstSeenAt: senders.firstSeenAt,
        lastSeenAt: senders.lastSeenAt,
      })
      .from(senders)
      .where(
        and(
          eq(senders.mailAccountId, mailAccountId),
          eq(senders.status, SENDER_STATUS.UNSUBSCRIBED),
        ),
      ),
  ]);

  return summariseStats({ all, recent, previous, confirmed });
}
