import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mailAccounts, users, type MailAccount, type User } from "@/db/schema";
import { readSession } from "@/lib/session";
import { HttpError } from "./respond";

/**
 * Who is making this request.
 *
 * The session cookie holds only a user id, so every request re-reads the user
 * from the database. A deleted user with a valid cookie is treated as logged
 * out rather than crashing.
 */

export async function getCurrentUser(): Promise<User | null> {
  const session = await readSession();
  if (!session) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return user ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError("You need to sign in first.", 401);
  return user;
}

/**
 * The mailbox we act on.
 *
 * v1 works with one connected mailbox, so this returns the most recently
 * connected one. When multi-account arrives, routes take an accountId and this
 * becomes a lookup by id scoped to the user.
 */
export async function getPrimaryAccount(userId: string): Promise<MailAccount | null> {
  const [account] = await db
    .select()
    .from(mailAccounts)
    .where(eq(mailAccounts.userId, userId))
    .orderBy(desc(mailAccounts.createdAt))
    .limit(1);

  return account ?? null;
}

export async function requireAccount(userId: string): Promise<MailAccount> {
  const account = await getPrimaryAccount(userId);
  if (!account) {
    throw new HttpError("No mailbox is connected to this account.", 409);
  }
  return account;
}

/** Loads an account by id, refusing accounts belonging to somebody else. */
export async function requireOwnedAccount(
  userId: string,
  accountId: string,
): Promise<MailAccount> {
  const [account] = await db
    .select()
    .from(mailAccounts)
    .where(and(eq(mailAccounts.id, accountId), eq(mailAccounts.userId, userId)))
    .limit(1);

  if (!account) throw new HttpError("Mailbox not found.", 404);
  return account;
}
