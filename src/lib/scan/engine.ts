import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq, sql, count, isNull } from "drizzle-orm";
import { db } from "@/db";
import { scans, senders, scannedMessages, type MailAccount, type Scan } from "@/db/schema";
import { HttpError } from "@/lib/api/respond";
import {
  getProviderForAccount,
  looksLikeSubscription,
  type MailProvider,
  type MessageHeaders,
} from "@/lib/mail";
import { parseFromHeader, parseUnsubscribeHeaders } from "@/lib/mail/headers";
import { SCAN_PAGE_SIZE, SCAN_STATUS } from "@/lib/constants";

/**
 * The scan engine.
 *
 * A scan walks the mailbox one page at a time and collapses messages into
 * senders. It runs in chunks driven by the browser rather than as one long
 * server job, which means:
 *
 *   - no request ever runs long enough to hit a serverless timeout
 *   - the progress bar reflects real work, not a guess
 *   - closing the tab pauses the scan instead of losing it; reopening resumes
 *
 * The cursor and page counters are saved atomically with the sender changes.
 */

export type ScanProgress = {
  scanId: string;
  status: Scan["status"];
  processedMessages: number;
  matchedMessages: number;
  foundSenders: number;
  totalEstimate: number;
  /** 0–1. Best effort, since providers only estimate totals. */
  fraction: number;
  done: boolean;
  error: string | null;
};

/** Starts a new scan, replacing any scan already running for this mailbox. */
export async function startScan(
  account: MailAccount,
  lookbackDays: number,
): Promise<Scan> {
  return withDatabaseRetry(() => db.transaction(async (tx) => {
    await tx
      .update(scans)
      .set({ status: SCAN_STATUS.CANCELLED, finishedAt: new Date() })
      .where(
        and(
          eq(scans.mailAccountId, account.id),
          eq(scans.status, SCAN_STATUS.RUNNING),
        ),
      );

    const [scan] = await tx
      .insert(scans)
      .values({ mailAccountId: account.id, lookbackDays })
      .returning();

    return scan;
  }));
}

/**
 * Processes exactly one page of the mailbox and returns updated progress.
 *
 * Safe to call repeatedly; calling it on a finished scan is a no-op that just
 * reports the final state.
 */
export async function runScanStep(
  account: MailAccount,
  scan: Scan,
  /** Injectable for tests; in production the account decides the provider. */
  mailProvider?: MailProvider,
): Promise<ScanProgress> {
  const current = await loadScan(account.id, scan.id);
  if (current.status !== SCAN_STATUS.RUNNING ||
      current.pageToken !== scan.pageToken ||
      current.processedMessages !== scan.processedMessages) {
    return toProgress(current);
  }
  scan = current;

  try {
    const provider = mailProvider ?? (await getProviderForAccount(account));

    const page = await provider.listSubscriptionMessages({
      lookbackDays: scan.lookbackDays,
      pageToken: scan.pageToken,
      pageSize: SCAN_PAGE_SIZE,
    });

    // Keep only messages that really look like bulk mail. The provider query
    // is a coarse net; the headers are the real test.
    const messages = [...new Map(page.messages.map((message) => [message.id, message])).values()];
    const subscriptions = messages.filter(looksLikeSubscription);
    const grouped = groupBySender(subscriptions);
    const finished = !page.nextPageToken;
    if (!finished && page.nextPageToken === scan.pageToken) {
      throw new Error("The mailbox returned the same page cursor. Please start a new scan.");
    }

    // The cursor and all sender changes commit together. A competing request
    // can only commit if this exact page is still current and not cancelled.
    return await withDatabaseRetry(() => db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(scans)
        .set({
          pageToken: page.nextPageToken,
          processedMessages: scan.processedMessages + messages.length,
          matchedMessages: scan.matchedMessages + subscriptions.length,
          totalEstimate: Math.max(scan.totalEstimate, page.totalEstimate),
          status: finished ? SCAN_STATUS.DONE : SCAN_STATUS.RUNNING,
          finishedAt: finished ? new Date() : null,
        })
        .where(currentPage(account.id, scan))
        .returning();

      if (!claimed) return toProgress(await loadScan(account.id, scan.id, tx));

      for (const entry of grouped) {
        const senderId = await upsertSender(tx, account.id, entry);
        await tx.insert(scannedMessages).values(entry.messageIds.map((messageId) => ({
          mailAccountId: account.id, messageId, senderId,
        }))).onConflictDoNothing();
        // Rebuild from unique IDs, also repairing inflated legacy counts when
        // this sender is encountered after upgrading.
        await tx.update(senders).set({
          messageCount: sql`(select count(*) from ${scannedMessages}
            where ${scannedMessages.senderId} = ${senderId})`,
        }).where(eq(senders.id, senderId));
      }

      const [{ value: senderCount }] = await tx.select({ value: count() })
        .from(senders).where(eq(senders.mailAccountId, account.id));
      const [updated] = await tx.update(scans).set({ foundSenders: senderCount })
        .where(eq(scans.id, scan.id)).returning();
      return toProgress(updated);
    }));
  } catch (error) {
    if (isDatabaseBusy(error)) {
      throw new HttpError("The scan is busy. Please try again shortly.", 503);
    }
    const message = error instanceof Error ? error.message : String(error);

    const [failed] = await withDatabaseRetry(() => db
      .update(scans)
      .set({
        status: SCAN_STATUS.ERROR,
        error: message.slice(0, 500),
        finishedAt: new Date(),
      })
      .where(currentPage(account.id, scan))
      .returning());

    return toProgress(failed ?? await loadScan(account.id, scan.id));
  }
}

type ScanTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function currentPage(mailAccountId: string, scan: Scan) {
  return and(
    eq(scans.id, scan.id), eq(scans.mailAccountId, mailAccountId),
    eq(scans.status, SCAN_STATUS.RUNNING),
    eq(scans.processedMessages, scan.processedMessages),
    scan.pageToken === null ? isNull(scans.pageToken) : eq(scans.pageToken, scan.pageToken),
  );
}

async function loadScan(mailAccountId: string, scanId: string, query: typeof db | ScanTransaction = db) {
  const [scan] = await withDatabaseRetry(() => query.select().from(scans)
    .where(and(eq(scans.id, scanId), eq(scans.mailAccountId, mailAccountId))).limit(1));
  if (!scan) throw new HttpError("Scan not found.", 404);
  return scan;
}

function isDatabaseBusy(error: unknown): boolean {
  let cause = error;
  for (let depth = 0; depth < 8 && cause && typeof cause === "object"; depth++) {
    const detail = cause as { code?: unknown; cause?: unknown };
    if (typeof detail.code === "string" && /^SQLITE_(BUSY|LOCKED)(_|$)/.test(detail.code)) return true;
    cause = detail.cause;
  }
  return false;
}

/** Only retry database work; mailbox calls remain outside the transaction. */
async function withDatabaseRetry<T>(operation: () => PromiseLike<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isDatabaseBusy(error) || attempt >= 4) throw error;
      await delay(25 * 2 ** attempt);
    }
  }
}

export function toProgress(scan: Scan): ScanProgress {
  const done =
    scan.status === SCAN_STATUS.DONE ||
    scan.status === SCAN_STATUS.ERROR ||
    scan.status === SCAN_STATUS.CANCELLED;

  const fraction =
    scan.totalEstimate > 0
      ? Math.min(1, scan.processedMessages / scan.totalEstimate)
      : done
        ? 1
        : 0;

  return {
    scanId: scan.id,
    status: scan.status,
    processedMessages: scan.processedMessages,
    matchedMessages: scan.matchedMessages,
    foundSenders: scan.foundSenders,
    totalEstimate: scan.totalEstimate,
    fraction: done ? 1 : fraction,
    done,
    error: scan.error,
  };
}

// --- Grouping ---------------------------------------------------------------

type SenderDraft = {
  address: string;
  name: string | null;
  messageIds: string[];
  firstSeenAt: Date;
  lastSeenAt: Date;
  sampleSubject: string | null;
  sampleMessageId: string | null;
  unsubscribeHttp: string | null;
  unsubscribeMailto: string | null;
  oneClick: boolean;
};

/**
 * Collapses a page of messages into one draft per sending address, keeping the
 * newest subject as the sample and the best unsubscribe method found.
 */
function groupBySender(messages: MessageHeaders[]): SenderDraft[] {
  const drafts = new Map<string, SenderDraft>();

  for (const message of messages) {
    const { address, name } = parseFromHeader(message.from);
    if (!address) continue;

    const targets = parseUnsubscribeHeaders(
      message.listUnsubscribe,
      message.listUnsubscribePost,
    );
    const date = message.date ?? new Date();

    const existing = drafts.get(address);

    if (!existing) {
      drafts.set(address, {
        address,
        name,
        messageIds: [message.id],
        firstSeenAt: date,
        lastSeenAt: date,
        sampleSubject: message.subject,
        sampleMessageId: message.id,
        unsubscribeHttp: targets.http,
        unsubscribeMailto: targets.mailto,
        oneClick: targets.oneClick,
      });
      continue;
    }

    existing.messageIds.push(message.id);
    if (date < existing.firstSeenAt) existing.firstSeenAt = date;
    if (date >= existing.lastSeenAt) {
      existing.lastSeenAt = date;
      existing.sampleSubject = message.subject;
      existing.sampleMessageId = message.id;
    }
    existing.name ??= name;
    existing.unsubscribeHttp ??= targets.http;
    existing.unsubscribeMailto ??= targets.mailto;
    existing.oneClick ||= targets.oneClick;
  }

  return [...drafts.values()];
}

/**
 * Inserts a sender, or merges into the existing row if we have seen it before.
 *
 * Two rules matter here:
 *   - unique message IDs determine counts across pages and across scans
 *   - a decision the user already made (KEPT, UNSUBSCRIBED) is never reset by
 *     a later scan; only counts and metadata are refreshed
 */
async function upsertSender(tx: ScanTransaction, mailAccountId: string, draft: SenderDraft): Promise<string> {
  const [sender] = await tx
    .insert(senders)
    .values({
      mailAccountId,
      address: draft.address,
      name: draft.name,
      messageCount: 0,
      firstSeenAt: draft.firstSeenAt,
      lastSeenAt: draft.lastSeenAt,
      sampleSubject: draft.sampleSubject,
      sampleMessageId: draft.sampleMessageId,
      unsubscribeHttp: draft.unsubscribeHttp,
      unsubscribeMailto: draft.unsubscribeMailto,
      oneClick: draft.oneClick,
    })
    .onConflictDoUpdate({
      target: [senders.mailAccountId, senders.address],
      set: {
        firstSeenAt: sql`min(${senders.firstSeenAt}, excluded.first_seen_at)`,
        lastSeenAt: sql`max(${senders.lastSeenAt}, excluded.last_seen_at)`,
        name: sql`coalesce(${senders.name}, excluded.name)`,
        // Keep the subject belonging to the newest message we have seen.
        sampleSubject: sql`case when excluded.last_seen_at >= ${senders.lastSeenAt}
          then excluded.sample_subject else ${senders.sampleSubject} end`,
        sampleMessageId: sql`case when excluded.last_seen_at >= ${senders.lastSeenAt}
          then excluded.sample_message_id else ${senders.sampleMessageId} end`,
        // Prefer a freshly seen unsubscribe target, but never lose an old one.
        unsubscribeHttp: sql`coalesce(excluded.unsubscribe_http, ${senders.unsubscribeHttp})`,
        unsubscribeMailto: sql`coalesce(excluded.unsubscribe_mailto, ${senders.unsubscribeMailto})`,
        oneClick: sql`${senders.oneClick} or excluded.one_click`,
        updatedAt: new Date(),
      },
    }).returning({ id: senders.id });
  return sender.id;
}
