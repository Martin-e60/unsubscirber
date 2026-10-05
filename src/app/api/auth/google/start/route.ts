import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { getAuthorizationUrl } from "@/lib/google/oauth";
import { route } from "@/lib/api/respond";
import { authMode } from "@/lib/auth-flow";
import { createOAuthState, type OAuthIntent } from "@/lib/auth/oauth-state";
import { authFailure, mailboxReturn } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/api/auth";
import { safeNextPath } from "@/lib/auth/next";
import { GMAIL_MODIFY_SCOPE, scopeAccess } from "@/lib/constants";
import { findOwnedMailbox, hasMailbox } from "@/lib/mailbox/server";
import { MAILBOX_ERROR_PARAM, MAILBOX_PARAM } from "@/lib/mailbox/shared";
import { env } from "@/lib/env";

/**
 * Step 1 of every Google trip: decide what it is for, then send the person
 * to Google.
 *
 *   signed out                 → login / register (sign in to Tidely)
 *   signed in                  → add a Gmail mailbox (the default)
 *   signed in, mode=reconnect  → refresh one named mailbox (?mailbox=<id>),
 *                                with &access=organise to add Clear out's
 *                                organise permission
 *
 * The `state` value is random, stored in a short-lived signed cookie along
 * with that purpose, the user and the mailbox, and checked on the way back.
 * That is what stops an attacker feeding your browser someone else's
 * authorisation code, and what keeps a reconnect from landing on a
 * different mailbox.
 */

export const dynamic = "force-dynamic";

export const GET = route(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const requested = params.get("mode");
  const user = await getCurrentUser();
  const next = safeNextPath(params.get("next"));

  const wantsMailbox =
    requested === "add" || requested === "connect" || requested === "reconnect" ||
    params.get("access") === "organise";
  if (wantsMailbox && !user) return authFailure("login", "expired");

  const intent: OAuthIntent = user
    ? requested === "reconnect" || params.get("access") === "organise" ? "reconnect" : "add"
    : authMode(requested);

  if (!process.env.GOOGLE_CLIENT_ID?.trim() || !process.env.GOOGLE_CLIENT_SECRET?.trim()) {
    if (intent === "login" || intent === "register") return authFailure(intent, "unavailable");
    return mailboxReturn(next ?? "/dashboard", { [MAILBOX_ERROR_PARAM]: "unavailable" });
  }

  // A reconnect is for one of the person's own mailboxes, named explicitly.
  let loginHint: string | null = null;
  let mailboxId: string | null = null;
  let organise = false;
  if (intent === "reconnect" && user) {
    const mailbox = await findOwnedMailbox(user.id, params.get(MAILBOX_PARAM) ?? "");
    if (!mailbox) {
      const fallback = (await hasMailbox(user.id)) ? next ?? "/settings" : "/connect";
      return mailboxReturn(fallback, { [MAILBOX_ERROR_PARAM]: "not_found" });
    }
    mailboxId = mailbox.id;
    loginHint = mailbox.email;
    // Asked for now, or granted before: either way the reconnect keeps it.
    organise = params.get("access") === "organise" || scopeAccess(mailbox.scope).canOrganise;
  }

  const state = crypto.randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(
    getAuthorizationUrl(state, {
      extraScopes: organise ? [GMAIL_MODIFY_SCOPE] : [],
      loginHint,
      // Adding a mailbox needs Google's account chooser, or a browser signed
      // in to one Google account would just reconnect that one.
      selectAccount: intent === "add",
    }),
  );

  response.cookies.set(
    "oauth_state",
    await createOAuthState(state, {
      intent,
      userId: user?.id ?? null,
      mailboxId,
      access: intent === "reconnect" && params.get("access") === "organise" ? "organise" : null,
      next,
    }),
    {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 600, // ten minutes is plenty to finish a login
    },
  );

  return response;
});
