import "server-only";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { mailAccounts, users, type MailAccount, type User } from "@/db/schema";
import { HttpError } from "@/lib/api/respond";
import type { MailboxDto } from "@/lib/api/types";
import { scopeAccess } from "@/lib/constants";
import { decrypt, encrypt } from "@/lib/crypto";
import { revokeToken, type GoogleTokens } from "@/lib/google/oauth";
import {
  MAILBOX_HEADER,
  MAILBOX_NOT_FOUND,
  MAILBOX_REQUIRED,
  isMailboxId,
} from "./shared";

/**
 * Connected mailboxes on the server.
 *
 * Every lookup here is scoped to one user id, so a mailbox id taken from a
 * header, a URL or a request body can only ever reach the caller's own
 * mailboxes. A mailbox that belongs to somebody else and one that does not
 * exist give the same answer, so ids cannot be probed.
 */

/** Every mailbox the user has connected, oldest first — the switcher's order. */
export async function listMailboxes(userId: string): Promise<MailAccount[]> {
  return db
    .select()
    .from(mailAccounts)
    .where(eq(mailAccounts.userId, userId))
    .orderBy(asc(mailAccounts.createdAt), asc(mailAccounts.id));
}

export async function hasMailbox(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: mailAccounts.id })
    .from(mailAccounts)
    .where(eq(mailAccounts.userId, userId))
    .limit(1);
  return Boolean(row);
}

/** One of the user's mailboxes, or null. Never another user's. */
export async function findOwnedMailbox(
  userId: string,
  mailboxId: string,
): Promise<MailAccount | null> {
  if (!isMailboxId(mailboxId)) return null;
  const [row] = await db
    .select()
    .from(mailAccounts)
    .where(and(eq(mailAccounts.id, mailboxId), eq(mailAccounts.userId, userId)))
    .limit(1);
  return row ?? null;
}

export function mailboxNotFound(): HttpError {
  return new HttpError("That mailbox is no longer connected to your account.", 404, MAILBOX_NOT_FOUND);
}

/**
 * The mailbox a new tab opens on: the one chosen last, if it is still
 * connected, otherwise the most recently connected one.
 */
export async function rememberedMailbox(user: Pick<User, "id" | "activeMailAccountId">): Promise<MailAccount | null> {
  if (user.activeMailAccountId) {
    const chosen = await findOwnedMailbox(user.id, user.activeMailAccountId);
    if (chosen) return chosen;
  }
  const [newest] = await db
    .select()
    .from(mailAccounts)
    .where(eq(mailAccounts.userId, user.id))
    .orderBy(desc(mailAccounts.createdAt), desc(mailAccounts.id))
    .limit(1);
  return newest ?? null;
}

/**
 * The mailbox a request is about.
 *
 * The browser names it in the X-Tidely-Mailbox header on every request, and
 * it must be one of the caller's. A request that changes something must name
 * one: guessing could act on a mailbox the person was not looking at. A read
 * without the header — a bookmark, an old tab from before this change —
 * falls back to the remembered mailbox, which is always the caller's own.
 */
export async function mailboxForRequest(
  request: Request,
  user: Pick<User, "id" | "activeMailAccountId">,
): Promise<MailAccount> {
  const named = request.headers.get(MAILBOX_HEADER);
  if (named !== null) {
    const mailbox = await findOwnedMailbox(user.id, named.trim());
    if (!mailbox) throw mailboxNotFound();
    return mailbox;
  }

  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    throw new HttpError(
      "This request didn’t say which mailbox it is for. Reload the page and try again.",
      400,
      MAILBOX_REQUIRED,
    );
  }

  const fallback = await rememberedMailbox(user);
  if (!fallback) throw new HttpError("No mailbox is connected to this account.", 409);
  return fallback;
}

export function toMailboxDto(row: MailAccount): MailboxDto {
  return {
    id: row.id,
    email: row.email,
    provider: row.provider,
    label: row.label ?? null,
    needsReconnect: row.needsReconnect,
    canOrganise: scopeAccess(row.scope).canOrganise,
    connectedAt: row.createdAt.toISOString(),
  };
}

/** Remembers which mailbox to open on next time. Only the caller's own. */
export async function rememberActiveMailbox(userId: string, mailboxId: string): Promise<MailAccount> {
  const mailbox = await findOwnedMailbox(userId, mailboxId);
  if (!mailbox) throw mailboxNotFound();
  await db.update(users).set({ activeMailAccountId: mailbox.id }).where(eq(users.id, userId));
  return mailbox;
}

export async function renameMailbox(
  userId: string,
  mailboxId: string,
  label: string | null,
): Promise<MailAccount> {
  const [updated] = await db
    .update(mailAccounts)
    .set({ label, updatedAt: new Date() })
    .where(and(eq(mailAccounts.id, mailboxId), eq(mailAccounts.userId, userId)))
    .returning();
  if (!updated) throw mailboxNotFound();
  return updated;
}

/**
 * Stores the tokens Google returned for a mailbox the person just added.
 *
 * Adding a mailbox that is already connected refreshes it rather than
 * creating a second row: matched first by Google's stable account id, then by
 * address (the unique index). Google returns a refresh token only on some
 * consents, so a stored one is never replaced with nothing. Tokens are
 * encrypted before they reach the database.
 */
export async function storeMailbox(input: {
  userId: string;
  email: string;
  providerAccountId: string;
  tokens: GoogleTokens;
}): Promise<{ mailbox: MailAccount; created: boolean }> {
  const email = input.email.toLowerCase();
  const tokenFields = {
    accessTokenEnc: encrypt(input.tokens.accessToken),
    ...(input.tokens.refreshToken ? { refreshTokenEnc: encrypt(input.tokens.refreshToken) } : {}),
    expiresAt: input.tokens.expiresAt,
    scope: input.tokens.scope,
    needsReconnect: false,
    updatedAt: new Date(),
  };

  const [bySubject] = await db
    .select()
    .from(mailAccounts)
    .where(
      and(
        eq(mailAccounts.userId, input.userId),
        eq(mailAccounts.provider, "gmail"),
        eq(mailAccounts.providerAccountId, input.providerAccountId),
      ),
    )
    .limit(1);
  const [byEmail] = bySubject
    ? [bySubject]
    : await db
        .select()
        .from(mailAccounts)
        .where(
          and(
            eq(mailAccounts.userId, input.userId),
            eq(mailAccounts.provider, "gmail"),
            eq(mailAccounts.email, email),
          ),
        )
        .limit(1);

  if (byEmail) {
    const [updated] = await db
      .update(mailAccounts)
      .set({ ...tokenFields, email, providerAccountId: input.providerAccountId })
      .where(and(eq(mailAccounts.id, byEmail.id), eq(mailAccounts.userId, input.userId)))
      .returning();
    return { mailbox: updated, created: false };
  }

  // Two tabs finishing the same consent at once meet the unique index here,
  // and the second simply refreshes the row the first created.
  const [row] = await db
    .insert(mailAccounts)
    .values({
      userId: input.userId,
      provider: "gmail",
      email,
      providerAccountId: input.providerAccountId,
      refreshTokenEnc: null,
      ...tokenFields,
    })
    .onConflictDoUpdate({
      target: [mailAccounts.userId, mailAccounts.provider, mailAccounts.email],
      set: { ...tokenFields, providerAccountId: input.providerAccountId },
    })
    .returning();
  return { mailbox: row, created: true };
}

/**
 * New tokens for a mailbox that is already connected, after a sign-in or a
 * reconnect proved it is the same Google account. Never creates a mailbox:
 * signing in must not quietly bring back one the person removed.
 */
export async function refreshMailboxTokens(
  mailbox: MailAccount,
  input: { email: string; providerAccountId: string; tokens: GoogleTokens },
): Promise<MailAccount> {
  const [updated] = await db
    .update(mailAccounts)
    .set({
      accessTokenEnc: encrypt(input.tokens.accessToken),
      ...(input.tokens.refreshToken ? { refreshTokenEnc: encrypt(input.tokens.refreshToken) } : {}),
      expiresAt: input.tokens.expiresAt,
      scope: input.tokens.scope,
      email: input.email.toLowerCase(),
      providerAccountId: input.providerAccountId,
      needsReconnect: false,
      updatedAt: new Date(),
    })
    .where(and(eq(mailAccounts.id, mailbox.id), eq(mailAccounts.userId, mailbox.userId)))
    .returning();
  return updated ?? mailbox;
}

/**
 * Whether a Google profile is the account this mailbox was connected with.
 * Google's account id when it was recorded; for older mailboxes, the address.
 */
export function sameGoogleAccount(
  mailbox: Pick<MailAccount, "providerAccountId" | "email">,
  profile: { sub: string; email: string },
): boolean {
  if (mailbox.providerAccountId) return mailbox.providerAccountId === profile.sub;
  return mailbox.email.toLowerCase() === profile.email.toLowerCase();
}

/** The user's mailbox for a Google account, if they already connected it. */
export async function findMailboxForGoogleAccount(
  userId: string,
  profile: { sub: string; email: string },
): Promise<MailAccount | null> {
  const rows = await listMailboxes(userId);
  return (
    rows.find((row) => row.provider === "gmail" && row.providerAccountId === profile.sub) ??
    rows.find(
      (row) =>
        row.provider === "gmail" &&
        !row.providerAccountId &&
        row.email.toLowerCase() === profile.email.toLowerCase(),
    ) ??
    null
  );
}

export async function markNeedsReconnect(mailboxId: string): Promise<void> {
  await db
    .update(mailAccounts)
    .set({ needsReconnect: true, updatedAt: new Date() })
    .where(eq(mailAccounts.id, mailboxId));
}

/**
 * Revokes Tidely's Google grant for a mailbox, best effort.
 *
 * Google revokes the whole grant for that Google account, not one token. So
 * when another Tidely profile has connected the same address, the grant is
 * left alone — revoking it would silently disconnect them too. The row is
 * deleted either way, which is what removes Tidely's access to the tokens.
 */
export async function revokeIfUnshared(mailbox: MailAccount): Promise<void> {
  if (!mailbox.refreshTokenEnc) return;
  const [shared] = await db
    .select({ id: mailAccounts.id })
    .from(mailAccounts)
    .where(
      and(
        eq(mailAccounts.provider, mailbox.provider),
        eq(mailAccounts.email, mailbox.email),
        ne(mailAccounts.id, mailbox.id),
      ),
    )
    .limit(1);
  if (shared) return;
  try {
    await revokeToken(decrypt(mailbox.refreshTokenEnc));
  } catch (error) {
    console.error("[mailboxes] token revoke failed:", error instanceof Error ? error.name : "unknown");
  }
}

/**
 * Disconnects one mailbox: revokes its grant and deletes the row, which
 * cascades to that mailbox's senders, scans, attempts and Clear out History.
 * Other mailboxes and the Tidely login are untouched. If it was the
 * remembered mailbox, the remembered choice moves to one that remains.
 */
export async function removeMailbox(
  userId: string,
  mailboxId: string,
): Promise<{ removed: MailAccount; remaining: MailAccount[]; activeMailboxId: string | null }> {
  const mailbox = await findOwnedMailbox(userId, mailboxId);
  if (!mailbox) throw mailboxNotFound();

  await revokeIfUnshared(mailbox);
  await db
    .delete(mailAccounts)
    .where(and(eq(mailAccounts.id, mailbox.id), eq(mailAccounts.userId, userId)));

  const remaining = await listMailboxes(userId);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const stillRemembered =
    user?.activeMailAccountId && remaining.some((row) => row.id === user.activeMailAccountId)
      ? user.activeMailAccountId
      : null;
  const next = stillRemembered ?? remaining.at(-1)?.id ?? null;
  if (user && user.activeMailAccountId !== next) {
    await db.update(users).set({ activeMailAccountId: next }).where(eq(users.id, userId));
  }

  return { removed: mailbox, remaining, activeMailboxId: next };
}
