import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { getAuthorizationUrl } from "@/lib/google/oauth";
import { route } from "@/lib/api/respond";
import { authMode } from "@/lib/auth-flow";
import { createOAuthState } from "@/lib/auth/oauth-state";
import { authFailure } from "@/lib/auth/redirect";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";
import { GMAIL_MODIFY_SCOPE } from "@/lib/constants";
import { env } from "@/lib/env";

/**
 * Step 1 of sign-in: send the user to Google.
 *
 * The `state` value is random, stored in a short-lived cookie, and checked on
 * the way back. That is what stops an attacker from feeding your browser
 * someone else's authorisation code.
 */

export const dynamic = "force-dynamic";

export const GET = route(async (request: NextRequest) => {
  const requested = request.nextUrl.searchParams.get("mode");
  const user = await getCurrentUser();
  const mode = user ? "connect" : authMode(requested);
  if (requested === "connect" && !user) return authFailure("login", "expired");
  if (!process.env.GOOGLE_CLIENT_ID?.trim() || !process.env.GOOGLE_CLIENT_SECRET?.trim()) {
    return authFailure(mode, "unavailable");
  }
  const state = crypto.randomBytes(32).toString("base64url");

  // Clear out's "organise" permission is added to an existing connection, for
  // the mailbox already connected — never a first connection, never another one.
  const organise = request.nextUrl.searchParams.get("access") === "organise" && mode === "connect";
  const account = organise && user ? await getPrimaryAccount(user.id) : null;
  if (organise && !account) return NextResponse.redirect(`${env.appUrl}/connect`);

  const response = NextResponse.redirect(
    getAuthorizationUrl(state, organise ? { extraScopes: [GMAIL_MODIFY_SCOPE], loginHint: account?.email } : {}),
  );

  // A sign-in from a page that asked for it returns there; validated in createOAuthState.
  const next = request.nextUrl.searchParams.get("next");
  response.cookies.set("oauth_state", await createOAuthState(state, mode, user?.id ?? null, organise ? "organise" : null, next), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // ten minutes is plenty to finish a login
  });

  return response;
});
