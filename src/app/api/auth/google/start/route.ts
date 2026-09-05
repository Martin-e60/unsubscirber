import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getAuthorizationUrl } from "@/lib/google/oauth";
import { route } from "@/lib/api/respond";

/**
 * Step 1 of sign-in: send the user to Google.
 *
 * The `state` value is random, stored in a short-lived cookie, and checked on
 * the way back. That is what stops an attacker from feeding your browser
 * someone else's authorisation code.
 */

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const state = crypto.randomBytes(32).toString("base64url");

  const response = NextResponse.redirect(getAuthorizationUrl(state));

  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // ten minutes is plenty to finish a login
  });

  return response;
});
