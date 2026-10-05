import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type MailAccount, type User } from "@/db/schema";
import { readSession } from "@/lib/session";
import { issuedBeforePasswordChange } from "@/lib/auth/session-rules";
import {
  findOwnedMailbox,
  hasMailbox,
  mailboxForRequest,
  mailboxNotFound,
  rememberedMailbox,
} from "@/lib/mailbox/server";
import { HttpError } from "./respond";

/**
 * Who is making this request.
 *
 * The session cookie holds only a user id, so every request re-reads the user
 * from the database. A deleted user with a valid cookie is treated as logged
 * out rather than crashing, and so is a session signed before the account's
 * last password reset.
 */

export async function getCurrentUser(): Promise<User | null> {
  const session = await readSession();
  if (!session) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user || issuedBeforePasswordChange(session.issuedAt, user.passwordChangedAt)) return null;
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError("You need to sign in first.", 401);
  return user;
}

/**
 * The signed-in user and the mailbox this request is about.
 *
 * The mailbox comes from the request's X-Tidely-Mailbox header and must be
 * one of the user's own — see mailboxForRequest. Every route that reads or
 * changes mail goes through this, so none of them can reach another user's
 * mailbox, or a different one of the user's mailboxes than the browser named.
 */
export async function requireUserAndMailbox(
  request: Request,
): Promise<{ user: User; account: MailAccount }> {
  const user = await requireUser();
  const account = await mailboxForRequest(request, user);
  return { user, account };
}

/** The mailbox a new tab opens on, or null when none is connected. */
export async function getActiveAccount(user: User): Promise<MailAccount | null> {
  return rememberedMailbox(user);
}

/** Loads an account by id, refusing accounts belonging to somebody else. */
export async function requireOwnedAccount(
  userId: string,
  accountId: string,
): Promise<MailAccount> {
  const account = await findOwnedMailbox(userId, accountId);
  if (!account) throw mailboxNotFound();
  return account;
}

export { hasMailbox };
