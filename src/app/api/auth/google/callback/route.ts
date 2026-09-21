import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { mailAccounts } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { exchangeCodeForTokens, fetchUserInfo } from "@/lib/google/oauth";
import { createSession, setSessionCookie } from "@/lib/session";
import { route } from "@/lib/api/respond";
import { readOAuthState } from "@/lib/auth/oauth-state";
import { authFailure } from "@/lib/auth/redirect";
import { resolveGoogleUser, GoogleAccountError } from "@/lib/auth/google-user";
import { getCurrentUser } from "@/lib/api/auth";

/**
 * Step 2 of sign-in: Google sends the user back here with a code.
 *
 * We verify the state, swap the code for tokens, create or find the user,
 * store the mailbox with its tokens encrypted, and start a session.
 */

export const dynamic = "force-dynamic";

// Use fixed diagnostic labels: raw errors can include SQL parameters or tokens.
function failureReason(cause: unknown): string {
  let current = cause;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (current instanceof GoogleAccountError) return current.code;
    for (const key of ["SESSION_SECRET", "ENCRYPTION_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) {
      if (current.message.startsWith(`Missing required environment variable ${key}.`)) return `missing_${key}`;
      if (current.message.startsWith(`${key} must be 32 bytes`)) return `invalid_${key}`;
    }
    for (const code of ["invalid_client", "invalid_grant", "redirect_uri_mismatch", "unauthorized_client"]) {
      if (current.message.startsWith(`Google rejected the authorisation code: ${code}`)) return code;
    }
    if (current.message.includes("no such table:")) return "database_table_missing";
    if (current.message.includes("no such column:")) return "database_column_missing";
    current = current.cause;
  }
  return "unexpected_error";
}

export const GET = route(async (request: NextRequest) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const context = await readOAuthState(request.cookies.get("oauth_state")?.value, state);
  if (!context) return authFailure("login", "expired");
  if (error) return authFailure(context.mode, error === "access_denied" ? "cancelled" : "failed");
  if (!code) return authFailure(context.mode, "incomplete");
  const currentUser = await getCurrentUser();
  if ((currentUser?.id ?? null) !== context.userId) return authFailure("login", "expired");

  let stage = "exchange_google_code";
  try {
  const tokens = await exchangeCodeForTokens(code);
  stage = "fetch_google_profile";
  const profile = await fetchUserInfo(tokens.accessToken);

  stage = "resolve_user";
  const email = profile.email.toLowerCase();

  const user = await resolveGoogleUser(profile, context.mode === "connect" ? context.userId : null);

  stage = "encrypt_and_store_mailbox";
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

  stage = "create_session";
  await setSessionCookie(await createSession(user.id));

  stage = "redirect_to_dashboard";
  const response = NextResponse.redirect(`${env.appUrl}/dashboard`);
  response.cookies.delete("oauth_state");
  return response;
  } catch (cause) {
    console.error("[auth/google/callback] sign-in failed", {
      stage,
      reason: failureReason(cause),
    });
    return authFailure(context.mode, cause instanceof GoogleAccountError ? cause.code : "failed");
  }
});
