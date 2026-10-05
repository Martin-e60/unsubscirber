import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { exchangeCodeForTokens, fetchUserInfo } from "@/lib/google/oauth";
import { createSession, setSessionCookie } from "@/lib/session";
import { route } from "@/lib/api/respond";
import { readOAuthState, type OAuthContext } from "@/lib/auth/oauth-state";
import { authFailure, mailboxReturn } from "@/lib/auth/redirect";
import { GoogleAccountError } from "@/lib/auth/google-user";
import { completeMailboxConsent, completeSignIn, mailboxFailure } from "@/lib/auth/google-consent";
import { getCurrentUser } from "@/lib/api/auth";
import type { User } from "@/db/schema";

/**
 * Step 2: Google sends the person back here with a code.
 *
 * The signed state cookie says what the trip was for — signing in, adding a
 * mailbox, or reconnecting one named mailbox — and the callback does only
 * that. Adding and reconnecting require the same signed-in person who started
 * the trip; signing in requires nobody to be signed in. Everything after the
 * calls to Google lives in src/lib/auth/google-consent.ts.
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

  // The person finishing the trip must be the one who started it.
  const currentUser = await getCurrentUser();
  if ((currentUser?.id ?? null) !== context.userId) return authFailure("login", "expired");

  if (context.intent === "add" || context.intent === "reconnect") {
    return mailboxCallback(context, currentUser!, code, error);
  }
  return signInCallback(context.intent, context.next, code, error);
});

async function signInCallback(
  mode: "login" | "register",
  next: string | null,
  code: string | null,
  error: string | null,
) {
  if (error) return authFailure(mode, error === "access_denied" ? "cancelled" : "failed");
  if (!code) return authFailure(mode, "incomplete");

  let stage = "exchange_google_code";
  try {
    const tokens = await exchangeCodeForTokens(code);
    stage = "fetch_google_profile";
    const profile = await fetchUserInfo(tokens.accessToken);

    stage = "resolve_user_and_mailbox";
    const { user, destination } = await completeSignIn({ tokens, profile, next });

    stage = "create_session";
    await setSessionCookie(await createSession(user.id));

    const response = NextResponse.redirect(`${env.appUrl}${destination}`);
    response.cookies.delete("oauth_state");
    return response;
  } catch (cause) {
    console.error("[auth/google/callback] sign-in failed", { stage, reason: failureReason(cause) });
    return authFailure(mode, cause instanceof GoogleAccountError ? cause.code : "failed");
  }
}

async function mailboxCallback(context: OAuthContext, user: User, code: string | null, error: string | null) {
  const finish = (outcome: { path: string; params: Record<string, string> }) =>
    mailboxReturn(outcome.path, outcome.params);

  if (error) return finish(await mailboxFailure(context, user, error === "access_denied" ? "cancelled" : "failed"));
  if (!code) return finish(await mailboxFailure(context, user, "failed"));

  let stage = "exchange_google_code";
  try {
    const tokens = await exchangeCodeForTokens(code);
    stage = "fetch_google_profile";
    const profile = await fetchUserInfo(tokens.accessToken);
    stage = context.intent === "reconnect" ? "reconnect_mailbox" : "store_mailbox";
    return finish(await completeMailboxConsent({ context, user, tokens, profile }));
  } catch (cause) {
    console.error("[auth/google/callback] mailbox consent failed", { stage, reason: failureReason(cause) });
    return finish(await mailboxFailure(context, user, "failed"));
  }
}
