import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import type { GoogleUserInfo } from "@/lib/google/oauth";
import type { AuthError } from "@/lib/auth-flow";

export class GoogleAccountError extends Error {
  constructor(public code: AuthError) { super(code); }
}

/** Google's answer is only usable with a stable id and a verified address. */
export function requireVerifiedProfile(profile: GoogleUserInfo): { sub: string; email: string } {
  if (!profile.sub || !profile.email || profile.email_verified !== true) throw new GoogleAccountError("failed");
  return { sub: profile.sub, email: profile.email.toLowerCase() };
}

/**
 * The Tidely profile a Google sign-in belongs to — signing in or signing up
 * only. Connecting a mailbox never comes through here, so adding a second
 * Gmail can never change which Google account signs in.
 *
 * `created` says whether this sign-in made a new profile, which is the one
 * time the sign-in's own mailbox is connected automatically.
 */
export async function resolveGoogleUser(profile: GoogleUserInfo): Promise<{ user: User; created: boolean }> {
  const { sub, email } = requireVerifiedProfile(profile);
  const [identity] = await db.select().from(users).where(eq(users.googleSub, sub)).limit(1);
  if (identity) return { user: identity, created: false };

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    // Never attach Google to an unverified password signup by email alone.
    // Existing Gmail-only accounts can acquire Google's stable subject ID.
    const authoritativeEmail = email.endsWith("@gmail.com") || Boolean(profile.hd);
    if (existing.passwordHash || existing.googleSub || !authoritativeEmail) throw new GoogleAccountError("account_exists");
    const [linked] = await db.update(users).set({ googleSub: sub })
      .where(and(eq(users.id, existing.id), isNull(users.googleSub), isNull(users.passwordHash))).returning();
    if (!linked) throw new GoogleAccountError("account_exists");
    return { user: linked, created: false };
  }
  const [created] = await db.insert(users).values({ email, googleSub: sub,
    name: profile.name ?? null, image: profile.picture ?? null }).onConflictDoNothing().returning();
  if (!created) throw new GoogleAccountError("account_exists");
  return { user: created, created: true };
}

/**
 * After a signed-in person connects a Gmail, lets that same Google account
 * sign them in too — but only when nothing would be replaced or borrowed:
 * the profile has no Google sign-in yet, the Gmail address is the profile's
 * own address, and no other profile signs in with this Google account.
 *
 * This is how someone who signed up with a password gains "Continue with
 * Google". Connecting any other address only adds a mailbox; an existing
 * Google sign-in is never swapped for the newly connected one.
 */
export async function linkGoogleSignInIfUnset(userId: string, profile: GoogleUserInfo): Promise<boolean> {
  const { sub, email } = requireVerifiedProfile(profile);
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.googleSub, sub)).limit(1);
  if (taken) return taken.id === userId;
  const [linked] = await db.update(users).set({ googleSub: sub })
    .where(and(eq(users.id, userId), isNull(users.googleSub), eq(users.email, email)))
    .returning({ id: users.id });
  return Boolean(linked);
}
