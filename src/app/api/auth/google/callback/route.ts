import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailAccounts, users } from "@/db/schema";
import { encrypt, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { exchangeCodeForTokens, fetchUserInfo } from "@/lib/google/oauth";
import { createSession, setSessionCookie } from "@/lib/session";
import { route } from "@/lib/api/respond";

/**
 * Step 2 of sign-in: Google sends the user back here with a code.
 *
 * We verify the state, swap the code for tokens, create or find the user,
 * store the mailbox with its tokens encrypted, and start a session.
 */

export const dynamic = "force-dynamic";

export const GET = route(async (request: NextRequest) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return failTo(`Google sign-in was cancelled (${error}).`);
  if (!code || !state) return failTo("Google sign-in returned an incomplete response.");

  const expectedState = request.cookies.get("oauth_state")?.value;
  if (!expectedState || !safeEqual(state, expectedState)) {
    return failTo("Sign-in expired or was tampered with. Please try again.");
  }

  const tokens = await exchangeCodeForTokens(code);
  const profile = await fetchUserInfo(tokens.accessToken);

  const email = profile.email.toLowerCase();

  // Find or create the user.
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const user =
    existingUser ??
    (
      await db
        .insert(users)
        .values({
          email,
          name: profile.name ?? null,
          image: profile.picture ?? null,
        })
        .returning()
    )[0];

  // Store the mailbox. Re-connecting an existing mailbox refreshes its tokens
  // rather than creating a duplicate.
  await db
    .insert(mailAccounts)
    .values({
      userId: user.id,
      provider: "gmail",
      email,
      accessTokenEnc: encrypt(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    })
    .onConflictDoUpdate({
      target: [mailAccounts.userId, mailAccounts.provider, mailAccounts.email],
      set: {
        accessTokenEnc: encrypt(tokens.accessToken),
        // Google only returns a refresh token on first consent, so never
        // overwrite a stored one with null.
        ...(tokens.refreshToken
          ? { refreshTokenEnc: encrypt(tokens.refreshToken) }
          : {}),
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
        updatedAt: new Date(),
      },
    });

  await setSessionCookie(await createSession(user.id));

  const response = NextResponse.redirect(`${env.appUrl}/dashboard`);
  response.cookies.delete("oauth_state");
  return response;
});

function failTo(message: string): NextResponse {
  const target = new URL("/", env.appUrl);
  target.searchParams.set("error", message);
  return NextResponse.redirect(target.toString());
}
