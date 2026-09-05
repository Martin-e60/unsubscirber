import "server-only";
import { and, desc, asc, eq, inArray, like, or, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { senders, unsubscribeAttempts, type Sender } from "@/db/schema";
import { ATTEMPT_STATUS, SENDER_STATUS, type SenderStatus } from "@/lib/constants";
import type { SenderCountsDto, SenderDto, SenderSort } from "./types";

/**
 * Reading the sender list.
 *
 * Kept out of the route handler so the same logic can be reused (a future
 * export, a digest email) without going through HTTP.
 */

export type ListSendersOptions = {
  mailAccountId: string;
  status?: SenderStatus | "ALL";
  search?: string;
  sort?: SenderSort;
  limit?: number;
  offset?: number;
};

export async function listSenders(options: ListSendersOptions) {
  const {
    mailAccountId,
    status = SENDER_STATUS.ACTIVE,
    search,
    sort = "count",
    limit = 200,
    offset = 0,
  } = options;

  const filters = [eq(senders.mailAccountId, mailAccountId)];

  if (status !== "ALL") filters.push(eq(senders.status, status));

  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    const match = or(like(senders.address, term), like(senders.name, term));
    if (match) filters.push(match);
  }

  const where = and(...filters);

  const orderBy =
    sort === "recent"
      ? [desc(senders.lastSeenAt)]
      : sort === "name"
        ? [asc(sql`coalesce(${senders.name}, ${senders.address})`)]
        : [desc(senders.messageCount), desc(senders.lastSeenAt)];

  const rows = await db
    .select()
    .from(senders)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(senders)
    .where(where);

  return { rows, total };
}

/** How many senders sit in each status, for the filter tabs. */
export async function countByStatus(mailAccountId: string): Promise<SenderCountsDto> {
  const rows = await db
    .select({ status: senders.status, value: count() })
    .from(senders)
    .where(eq(senders.mailAccountId, mailAccountId))
    .groupBy(senders.status);

  const counts = Object.values(SENDER_STATUS).reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as SenderCountsDto);

  for (const row of rows) counts[row.status] = row.value;
  return counts;
}

/**
 * Looks up the "finish this yourself" link for senders that ended in MANUAL,
 * in one query rather than one per row.
 */
export async function manualUrlsFor(senderIds: string[]): Promise<Map<string, string>> {
  if (senderIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(unsubscribeAttempts)
    .where(
      and(
        inArray(unsubscribeAttempts.senderId, senderIds),
        eq(unsubscribeAttempts.status, ATTEMPT_STATUS.MANUAL_REQUIRED),
      ),
    )
    .orderBy(desc(unsubscribeAttempts.createdAt));

  const map = new Map<string, string>();
  for (const row of rows) {
    // Rows are newest first, so the first one we see per sender wins.
    if (!map.has(row.senderId) && row.detail?.startsWith("http")) {
      map.set(row.senderId, row.detail);
    }
  }
  return map;
}

export function toSenderDto(sender: Sender, manualUrl: string | null = null): SenderDto {
  return {
    id: sender.id,
    address: sender.address,
    name: sender.name,
    messageCount: sender.messageCount,
    perMonth: emailsPerMonth(sender),
    lastSeenAt: sender.lastSeenAt ? sender.lastSeenAt.toISOString() : null,
    sampleSubject: sender.sampleSubject,
    status: sender.status,
    canOneClick: sender.oneClick && Boolean(sender.unsubscribeHttp),
    canUnsubscribe: Boolean(
      sender.unsubscribeHttp ?? sender.unsubscribeMailto ?? sender.sampleMessageId,
    ),
    manualUrl,
  };
}

/**
 * How often this sender writes, per month.
 *
 * Measured over the span we have actually seen rather than a fixed window, so
 * a sender first seen three weeks ago is not reported as if it had been quiet
 * for a year. Anything shorter than a month counts as one month.
 */
function emailsPerMonth(sender: Sender): number {
  const first = sender.firstSeenAt?.getTime();
  const last = sender.lastSeenAt?.getTime();
  if (!first || !last) return sender.messageCount;

  const months = Math.max(1, (last - first) / (30 * 86_400_000));
  return Math.max(1, Math.round(sender.messageCount / months));
}
