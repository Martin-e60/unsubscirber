import "server-only";
import { and, eq, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { scans, senders, type MailAccount, type Scan } from "@/db/schema";
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
 * `scans.pageToken` is the entire resume state.
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
  await db
    .update(scans)
    .set({ status: SCAN_STATUS.CANCELLED, finishedAt: new Date() })
    .where(
      and(
        eq(scans.mailAccountId, account.id),
        eq(scans.status, SCAN_STATUS.RUNNING),
      ),
    );

  const [scan] = await db
    .insert(scans)
    .values({ mailAccountId: account.id, lookbackDays })
    .returning();

  return scan;
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
  if (scan.status !== SCAN_STATUS.RUNNING) return toProgress(scan);

  try {
    const provider = mailProvider ?? (await getProviderForAccount(account));

    const page = await provider.listSubscriptionMessages({
      lookbackDays: scan.lookbackDays,
      pageToken: scan.pageToken,
      pageSize: SCAN_PAGE_SIZE,
    });

    // Keep only messages that really look like bulk mail. The provider query
    // is a coarse net; the headers are the real test.
    const subscriptions = page.messages.filter(looksLikeSubscription);
    const grouped = groupBySender(subscriptions);

    for (const entry of grouped) {
      await upsertSender(account.id, entry);
    }

    const [{ value: senderCount }] = await db
      .select({ value: count() })
      .from(senders)
      .where(eq(senders.mailAccountId, account.id));

    const finished = !page.nextPageToken;

    const [updated] = await db
      .update(scans)
      .set({
        pageToken: page.nextPageToken,
        processedMessages: scan.processedMessages + page.messages.length,
        matchedMessages: scan.matchedMessages + subscriptions.length,
        foundSenders: senderCount,
        totalEstimate: Math.max(scan.totalEstimate, page.totalEstimate),
        status: finished ? SCAN_STATUS.DONE : SCAN_STATUS.RUNNING,
        finishedAt: finished ? new Date() : null,
      })
      .where(eq(scans.id, scan.id))
      .returning();

    return toProgress(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    const [failed] = await db
      .update(scans)
      .set({
        status: SCAN_STATUS.ERROR,
        error: message.slice(0, 500),
        finishedAt: new Date(),
      })
      .where(eq(scans.id, scan.id))
      .returning();

    return toProgress(failed);
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
  messageCount: number;
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
        messageCount: 1,
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

    existing.messageCount += 1;
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
 *   - counts accumulate across pages and across scans
 *   - a decision the user already made (KEPT, UNSUBSCRIBED) is never reset by
 *     a later scan; only counts and metadata are refreshed
 */
async function upsertSender(mailAccountId: string, draft: SenderDraft): Promise<void> {
  await db
    .insert(senders)
    .values({
      mailAccountId,
      address: draft.address,
      name: draft.name,
      messageCount: draft.messageCount,
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
        messageCount: sql`${senders.messageCount} + excluded.message_count`,
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
    });
}
