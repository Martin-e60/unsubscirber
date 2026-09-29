import "server-only";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { scannedMessages, scans, senders, unsubscribeAttempts, type MailAccount } from "@/db/schema";
import {
  ATTEMPT_STATUS,
  DEFAULT_LOOKBACK_DAYS,
  LOOKBACK_OPTIONS,
  SCAN_STATUS,
  SENDER_STATUS,
} from "@/lib/constants";
import { lookbackToCover, observe, type CompletedCheck, type RecordedMessage } from "@/lib/followup/match";
import { gmailMessageUrl, toArchiveItem } from "@/lib/followup/archive";
import type { UnsubscribedResponse } from "./types";

/**
 * The Unsubscribed archive: confirmed unsubscribes only, and what has arrived
 * from each list since.
 *
 * A request that was only sent, an attempt that failed, or one waiting on a
 * click is not a confirmed unsubscribe, so none of them are here; they stay
 * in Senders under their own status.
 *
 * Read-only: building this page never touches the mailbox. New observations
 * come from scans, which only ever read message headers.
 */

/**
 * When the unsubscribe was confirmed: the successful attempt's own record,
 * or — for senders from before attempts were logged — when the decision was
 * saved. Both are written at the moment of confirmation, never by a scan.
 */
const unsubscribedAt = sql<number | null>`coalesce(
  (select max(${unsubscribeAttempts.createdAt}) from ${unsubscribeAttempts}
    where ${unsubscribeAttempts.senderId} = ${senders.id}
    and ${unsubscribeAttempts.status} = ${ATTEMPT_STATUS.SUCCESS}),
  ${senders.decidedAt}
)`;

export async function listArchive(options: {
  account: MailAccount;
  search?: string;
  senderId?: string;
  limit: number;
  offset: number;
  now?: Date;
}): Promise<UnsubscribedResponse> {
  const { account } = options;
  const archive = and(
    eq(senders.mailAccountId, account.id),
    eq(senders.status, SENDER_STATUS.UNSUBSCRIBED),
  );

  const filters = [archive];
  const term = options.search?.trim();
  if (term) {
    const pattern = `%${term.toLowerCase()}%`;
    filters.push(or(like(senders.address, pattern), like(senders.name, pattern)));
  }
  if (options.senderId) filters.push(eq(senders.id, options.senderId));
  const where = and(...filters);

  const [[{ value: archiveTotal }], [{ value: total }], [{ oldest }], [latestScan], rows] =
    await Promise.all([
      db.select({ value: count() }).from(senders).where(archive),
      db.select({ value: count() }).from(senders).where(where),
      db.select({ oldest: sql<number | null>`min(${unsubscribedAt})` }).from(senders).where(archive),
      db
        .select()
        .from(scans)
        .where(and(
          eq(scans.mailAccountId, account.id),
          eq(scans.status, SCAN_STATUS.DONE),
          isNotNull(scans.finishedAt),
        ))
        .orderBy(desc(scans.startedAt))
        .limit(1),
      db
        .select({ sender: senders, unsubscribedAt })
        .from(senders)
        .where(where)
        // Newest first; records without a date sort last.
        .orderBy(desc(unsubscribedAt), asc(sql`coalesce(${senders.name}, ${senders.address})`))
        .limit(options.limit)
        .offset(options.offset),
    ]);

  const latestCheck: CompletedCheck | null = latestScan?.finishedAt
    ? {
        startedAt: latestScan.startedAt,
        finishedAt: latestScan.finishedAt,
        lookbackDays: latestScan.lookbackDays,
      }
    : null;

  const ids = rows.map((row) => row.sender.id);
  const dated = rows.map((row) => row.unsubscribedAt).filter((at): at is number => at !== null);
  const earliest = dated.length ? Math.min(...dated) : null;

  const [listIds, later] = ids.length
    ? await Promise.all([
        db
          .select({
            senderId: scannedMessages.senderId,
            listId: scannedMessages.listId,
            firstAt: sql<number | null>`min(${scannedMessages.receivedAt})`,
          })
          .from(scannedMessages)
          .where(and(inArray(scannedMessages.senderId, ids), isNotNull(scannedMessages.listId)))
          .groupBy(scannedMessages.senderId, scannedMessages.listId),
        earliest === null
          ? Promise.resolve([])
          : db
              .select()
              .from(scannedMessages)
              .where(and(
                inArray(scannedMessages.senderId, ids),
                gt(scannedMessages.receivedAt, new Date(earliest)),
              )),
      ])
    : [[], []];

  const items = rows.map(({ sender, unsubscribedAt: at }) => {
    const confirmedAt = at === null ? null : new Date(at);
    const earlierListIds = listIds
      .filter((row) => row.senderId === sender.id && row.listId && row.firstAt !== null &&
        confirmedAt !== null && row.firstAt <= confirmedAt.getTime())
      .map((row) => row.listId!);
    const messages: RecordedMessage[] = later
      .filter((row) => row.senderId === sender.id)
      .map((row) => ({
        id: row.messageId,
        receivedAt: row.receivedAt,
        listId: row.listId,
        subject: row.subject,
      }));

    return toArchiveItem({
      senderId: sender.id,
      name: sender.name,
      address: sender.address,
      unsubscribedAt: confirmedAt,
      observation: observe({ unsubscribedAt: confirmedAt, earlierListIds, messages, latestCheck }),
      messageUrl: (messageId) => gmailMessageUrl(account.provider, account.email, messageId),
      unsubscribeHttp: sender.unsubscribeHttp,
    });
  });

  return {
    items,
    total,
    archiveTotal,
    lastCheck: latestCheck
      ? { finishedAt: latestCheck.finishedAt.toISOString(), lookbackDays: latestCheck.lookbackDays }
      : null,
    checkLookbackDays: lookbackToCover(
      oldest === null ? null : new Date(oldest),
      LOOKBACK_OPTIONS,
      DEFAULT_LOOKBACK_DAYS,
      options.now,
    ),
  };
}
