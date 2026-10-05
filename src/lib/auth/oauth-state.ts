import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { safeNextPath } from "@/lib/auth/next";
import { isMailboxId } from "@/lib/mailbox/shared";

/**
 * What a trip to Google is for, sealed in a signed, short-lived cookie.
 *
 *   login / register  sign in to Tidely with Google (no session yet)
 *   add               connect another Gmail mailbox to the signed-in profile
 *   reconnect         refresh one particular mailbox's grant, optionally
 *                     adding Clear out's organise permission
 *
 * Signing in and connecting mailboxes are separate on purpose: adding a
 * second Gmail never changes which Google account signs in to Tidely. The
 * cookie binds the trip to the user who started it and, for a reconnect, to
 * the exact mailbox — the callback refuses anything else.
 */

export type OAuthIntent = "login" | "register" | "add" | "reconnect";
/** Kept as an alias: the sign-in pages still speak of a "mode". */
export type OAuthMode = OAuthIntent;
/** "organise": a reconnect that adds Clear out's modify permission. */
export type OAuthAccess = "organise" | null;

export type OAuthContext = {
  intent: OAuthIntent;
  userId: string | null;
  mailboxId: string | null;
  access: OAuthAccess;
  next: string | null;
};

const INTENTS: readonly OAuthIntent[] = ["login", "register", "add", "reconnect"];

export async function createOAuthState(
  state: string,
  context: {
    intent: OAuthIntent;
    userId: string | null;
    mailboxId?: string | null;
    access?: OAuthAccess;
    /** Where to land afterwards; validated again when read back. */
    next?: string | null;
  },
) {
  return new SignJWT({
    state,
    intent: context.intent,
    userId: context.userId,
    mailboxId: context.mailboxId ?? null,
    access: context.access ?? null,
    next: safeNextPath(context.next ?? null),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("tidely-oauth")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(env.sessionSecret);
}

export async function readOAuthState(
  cookie: string | undefined,
  state: string | null,
): Promise<OAuthContext | null> {
  if (!cookie || !state) return null;
  try {
    const { payload } = await jwtVerify(cookie, env.sessionSecret, {
      algorithms: ["HS256"],
      audience: "tidely-oauth",
    });
    if (typeof payload.state !== "string" || !safeEqual(payload.state, state)) return null;

    const intent = payload.intent as OAuthIntent;
    if (!INTENTS.includes(intent)) return null;

    const userId = typeof payload.userId === "string" ? payload.userId : null;
    const mailboxId = isMailboxId(payload.mailboxId) ? payload.mailboxId : null;

    // Signing in starts signed out; changing mailboxes needs the person who asked.
    if ((intent === "login" || intent === "register") && userId !== null) return null;
    if ((intent === "add" || intent === "reconnect") && userId === null) return null;
    // A reconnect is always for one named mailbox.
    if (intent === "reconnect" && mailboxId === null) return null;

    return {
      intent,
      userId,
      mailboxId: intent === "reconnect" ? mailboxId : null,
      access: payload.access === "organise" && intent === "reconnect" ? "organise" : null,
      next: safeNextPath(payload.next),
    };
  } catch {
    return null;
  }
}
