import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { getAuthorizationUrl } from "@/lib/google/oauth";
import { route } from "@/lib/api/respond";
import { authMode } from "@/lib/auth-flow";
import { createOAuthState } from "@/lib/auth/oauth-state";
import { authFailure } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/api/auth";

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

  const response = NextResponse.redirect(getAuthorizationUrl(state));

  response.cookies.set("oauth_state", await createOAuthState(state, mode, user?.id ?? null), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // ten minutes is plenty to finish a login
  });

  return response;
});
