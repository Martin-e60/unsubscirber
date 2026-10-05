import "server-only";
import { and, desc, eq, inArray, lte, or, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clearOutRuns,
  scannedMessages,
  senders,
  type ClearOutRun,
  type MailAccount,
} from "@/db/schema";
import { HttpError } from "@/lib/api/respond";
import type { ClearOutAccessDto, ClearOutRunDto } from "@/lib/api/types";
import { SENDER_STATUS, scopeAccess } from "@/lib/constants";
import { reconnectHref } from "@/lib/mailbox/shared";
import { normaliseListId } from "@/lib/followup/match";
import { TokenRefreshError } from "@/lib/google/oauth";
import { GmailApiError } from "@/lib/mail/gmail";
import { getOrganiserForAccount, type MailOrganiser } from "@/lib/mail";
import type { ClearOutAction } from "./actions";
import { QueryError, readQuery, type UnsubscribedList } from "./filters";

/**
 * Clear out on the server: permissions, the mailbox, and History.
 *
 * Every function takes the caller's own mailbox, which the route has already
 * loaded for the signed-in user, so nothing here can reach another account.
 */

/**
 * Where the reconnect for organising starts — for this mailbox, by id, so
 * the permission is added to the mailbox on screen and no other.
 */
export function grantUrlFor(account: Pick<MailAccount, "id">): string {
  return reconnectHref(account.id, { organise: true, next: "/clear-out" });
}

export function accessFor(account: MailAccount): ClearOutAccessDto {
  const { canRead, canOrganise } = scopeAccess(account.scope);
  return { canRead, canOrganise, grantUrl: canOrganise ? null : grantUrlFor(account) };
}

export function requireRead(account: MailAccount): void {
  if (!accessFor(account).canRead) {
    throw new HttpError("Reconnect Gmail so Tidely can search your mail.", 403);
  }
}

export function requireOrganise(account: MailAccount): void {
  if (!accessFor(account).canOrganise) {
    throw new HttpError("Tidely needs your permission to organise mail.", 403);
  }
}

/**
 * Runs a mailbox call, turning provider failures into messages a person can
 * act on. The technical detail goes to the server log only — without
 * tokens, which never appear in a GmailApiError.
 */
export async function withOrganiser<T>(
  account: MailAccount,
  work: (organiser: MailOrganiser) => Promise<T>,
  /** What the call needed, so a refusal names the right permission. */
  need: "read" | "organise" = "read",
): Promise<T> {
  try {
    return await work(await getOrganiserForAccount(account));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof TokenRefreshError) {
      throw new HttpError("Gmail access has expired. Reconnect Gmail to continue.", 409);
    }
    if (error instanceof GmailApiError) {
      console.error("[clear-out] Gmail request failed", { status: error.status });
      // 401: the token itself is no longer accepted.
      if (error.status === 401) {
        throw new HttpError("Gmail access has expired. Reconnect Gmail to continue.", 409);
      }
      if (error.isPermission) {
        throw new HttpError(
          need === "organise"
            ? "Tidely needs your permission to organise mail."
            : "Reconnect Gmail so Tidely can search your mail.",
          403,
        );
      }
      if (error.status === 400) throw new HttpError("Gmail couldn’t run that search.", 400);
      if (error.status === 404) throw new HttpError("That email is no longer in your mailbox.", 404);
      throw new HttpError("Gmail didn’t respond. Please try again in a moment.", 502);
    }
    throw error;
  }
}

/** User labels, id → name. */
export async function userLabels(organiser: MailOrganiser): Promise<Map<string, string>> {
  const labels = await organiser.listLabels();
  return new Map(
    labels
      .filter((label) => label.type === "user")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((label) => [label.id, label.name]),
  );
}

/**
 * The lists you confirmed an unsubscribe from, as Cleanup identified them:
 * the exact sending address, and the List-Ids it used up to the unsubscribe.
 * A list with known List-Ids matches only mail carrying one of them, so a
 * receipt from the same address is not treated as the newsletter; other
 * addresses at the same domain never match.
 */
export async function unsubscribedLists(mailAccountId: string): Promise<UnsubscribedList[]> {
  const rows = await db
    .select({ id: senders.id, address: senders.address, decidedAt: senders.decidedAt })
    .from(senders)
    .where(and(eq(senders.mailAccountId, mailAccountId), eq(senders.status, SENDER_STATUS.UNSUBSCRIBED)));
  if (rows.length === 0) return [];

  const listIds = await db
    .selectDistinct({ senderId: scannedMessages.senderId, listId: scannedMessages.listId, decidedAt: senders.decidedAt })
    .from(scannedMessages)
    .innerJoin(senders, eq(senders.id, scannedMessages.senderId))
    .where(
      and(
        eq(scannedMessages.mailAccountId, mailAccountId),
        inArray(
          scannedMessages.senderId,
          rows.map((row) => row.id),
        ),
        sql`${scannedMessages.listId} is not null`,
        or(isNull(senders.decidedAt), lte(scannedMessages.receivedAt, senders.decidedAt)),
      ),
    );

  const bySender = new Map<string, Set<string>>();
  for (const row of listIds) {
    const id = normaliseListId(row.listId);
    if (!id) continue;
    const set = bySender.get(row.senderId) ?? new Set<string>();
    set.add(id);
    bySender.set(row.senderId, set);
  }

  return rows.map((row) => ({ address: row.address, listIds: [...(bySender.get(row.id) ?? [])] }));
}

// --- History ------------------------------------------------------------------

export function toRunDto(run: ClearOutRun): ClearOutRunDto {
  return {
    id: run.id,
    action: run.action,
    labelName: run.labelName,
    requested: run.requested,
    succeeded: run.succeeded,
    failed: run.failed,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

export async function createRun(
  mailAccountId: string,
  input: { action: ClearOutAction; requested: number; labelId: string | null; labelName: string | null },
): Promise<ClearOutRun> {
  const [run] = await db
    .insert(clearOutRuns)
    .values({
      mailAccountId,
      action: input.action,
      requested: input.requested,
      labelId: input.labelId,
      labelName: input.labelName,
    })
    .returning();
  return run;
}

/** A run, only if it belongs to this mailbox. */
export async function findRun(mailAccountId: string, runId: string): Promise<ClearOutRun | null> {
  const [run] = await db
    .select()
    .from(clearOutRuns)
    .where(and(eq(clearOutRuns.id, runId), eq(clearOutRuns.mailAccountId, mailAccountId)))
    .limit(1);
  return run ?? null;
}

/**
 * Adds a batch's confirmed outcome to its run. A retry moves emails from
 * failed to succeeded rather than counting them twice; nothing goes below
 * zero or above what was reviewed.
 */
export async function recordChunk(
  run: ClearOutRun,
  outcome: { succeeded: number; failed: number; retry: boolean },
): Promise<ClearOutRun> {
  const ok = Math.max(0, Math.trunc(outcome.succeeded));
  const bad = Math.max(0, Math.trunc(outcome.failed));

  // One statement, so two batches finishing together cannot lose a count.
  const succeeded = sql`min(${clearOutRuns.requested}, ${clearOutRuns.succeeded} + ${ok})`;
  const failed = outcome.retry
    ? sql`max(0, ${clearOutRuns.failed} - ${ok})`
    : sql`min(${clearOutRuns.requested} - min(${clearOutRuns.requested}, ${clearOutRuns.succeeded} + ${ok}), ${clearOutRuns.failed} + ${bad})`;

  const [updated] = await db
    .update(clearOutRuns)
    .set({ succeeded, failed, updatedAt: new Date() })
    .where(and(eq(clearOutRuns.id, run.id), eq(clearOutRuns.mailAccountId, run.mailAccountId)))
    .returning();
  return updated;
}

export async function listRuns(mailAccountId: string, limit = 50): Promise<ClearOutRun[]> {
  return db
    .select()
    .from(clearOutRuns)
    .where(eq(clearOutRuns.mailAccountId, mailAccountId))
    .orderBy(desc(clearOutRuns.createdAt))
    .limit(limit);
}

/** Reads a filter query, answering 400 rather than widening a malformed one. */
export function queryFrom(input: URLSearchParams | Record<string, unknown>) {
  try {
    return readQuery(input);
  } catch (error) {
    if (error instanceof QueryError) throw new HttpError("That filter isn’t valid. Clear it and try again.", 400);
    throw error;
  }
}
