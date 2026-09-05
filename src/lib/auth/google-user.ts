import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { GoogleUserInfo } from "@/lib/google/oauth";
import type { AuthError } from "@/lib/auth-flow";

export class GoogleAccountError extends Error {
  constructor(public code: AuthError) { super(code); }
}

export async function resolveGoogleUser(profile: GoogleUserInfo, connectedUserId: string | null) {
  if (!profile.sub || !profile.email || profile.email_verified !== true) throw new GoogleAccountError("failed");
  const email = profile.email.toLowerCase();
  const [identity] = await db.select().from(users).where(eq(users.googleSub, profile.sub)).limit(1);
  if (identity) {
    if (connectedUserId && identity.id !== connectedUserId) throw new GoogleAccountError("account_linked");
    return identity;
  }

  if (connectedUserId) {
    const [linked] = await db.update(users).set({ googleSub: profile.sub })
      .where(and(eq(users.id, connectedUserId), or(isNull(users.googleSub), eq(users.googleSub, profile.sub))))
      .returning();
    if (!linked) throw new GoogleAccountError("account_linked");
    return linked;
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    // Never attach Google to an unverified password signup by email alone.
    // Existing Gmail-only accounts can acquire Google's stable subject ID.
    const authoritativeEmail = email.endsWith("@gmail.com") || Boolean(profile.hd);
    if (existing.passwordHash || existing.googleSub || !authoritativeEmail) throw new GoogleAccountError("account_exists");
    const [linked] = await db.update(users).set({ googleSub: profile.sub })
      .where(and(eq(users.id, existing.id), isNull(users.googleSub), isNull(users.passwordHash))).returning();
    if (!linked) throw new GoogleAccountError("account_exists");
    return linked;
  }
  const [created] = await db.insert(users).values({ email, googleSub: profile.sub,
    name: profile.name ?? null, image: profile.picture ?? null }).onConflictDoNothing().returning();
  if (!created) throw new GoogleAccountError("account_exists");
  return created;
}
