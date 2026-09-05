import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailAccounts, users } from "@/db/schema";
import { DEV_USER_EMAIL, DEV_USER_NAME } from "@/lib/constants";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { createSession, setSessionCookie } from "@/lib/session";

/**
 * Development-only sign-in.
 *
 * Setting up Google OAuth takes five minutes of clicking in Cloud Console,
 * which is a silly price to pay for looking at a button colour. This route
 * signs you straight in as the demo account that `npm run db:seed` fills, so
 * the whole interface can be opened and worked on with no Google credentials
 * at all.
 *
 * It refuses to exist in a production build. That check is the only thing
 * standing between this and an authentication bypass, so it runs first, it
 * compares against NODE_ENV — which Next sets to "production" for `next build`
 * and cannot be talked out of — and it answers 404 rather than explaining
 * itself.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const user = await findOrCreateDevUser();
  await ensureDevMailbox(user.id);

  await setSessionCookie(await createSession(user.id));

  return NextResponse.redirect(`${env.appUrl}/dashboard`);
}

async function findOrCreateDevUser() {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, DEV_USER_EMAIL))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({ email: DEV_USER_EMAIL, name: DEV_USER_NAME })
    .returning();

  return created;
}

/**
 * The dashboard needs a connected mailbox to render, so give the demo user one
 * with placeholder tokens. Anything that actually calls Gmail — a scan, a real
 * unsubscribe — will fail, which is correct: there is no mailbox behind it.
 */
async function ensureDevMailbox(userId: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(mailAccounts)
    .where(eq(mailAccounts.userId, userId))
    .limit(1);

  if (existing) return;

  await db.insert(mailAccounts).values({
    userId,
    provider: "gmail",
    email: DEV_USER_EMAIL,
    accessTokenEnc: encrypt("dev-placeholder-access-token"),
    refreshTokenEnc: encrypt("dev-placeholder-refresh-token"),
    expiresAt: Date.now() + 3_600_000,
    scope: "development",
  });
}
