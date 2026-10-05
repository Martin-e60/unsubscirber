import "server-only";
import type { User } from "@/db/schema";
import type { GoogleTokens, GoogleUserInfo } from "@/lib/google/oauth";
import { scopeAccess } from "@/lib/constants";
import {
  findMailboxForGoogleAccount,
  findOwnedMailbox,
  hasMailbox,
  refreshMailboxTokens,
  rememberActiveMailbox,
  sameGoogleAccount,
  storeMailbox,
} from "@/lib/mailbox/server";
import {
  MAILBOX_ERROR_PARAM,
  MAILBOX_PARAM,
  MAILBOX_STATUS_PARAM,
  type MailboxError,
} from "@/lib/mailbox/shared";
import { linkGoogleSignInIfUnset, requireVerifiedProfile, resolveGoogleUser } from "./google-user";
import type { OAuthContext } from "./oauth-state";

/**
 * What happens once Google has answered — everything after the HTTP calls,
 * kept out of the route handler so it can be tested against a real database
 * without Google or a browser.
 *
 *   completeSignIn          login / register
 *   completeMailboxConsent  add / reconnect (and Clear out's organise reconnect)
 */

/** Where to send the browser, and the fixed outcome parameters to add. */
export type ConsentOutcome = { path: string; params: Record<string, string> };

/**
 * Signing in with Google. A brand-new profile also gets the Gmail it signed
 * up with — the one time a mailbox is connected without being asked for. An
 * existing profile only has that mailbox's tokens refreshed, and only if it
 * is still connected: signing in never brings back a mailbox the person
 * removed, and never connects a new one.
 */
export async function completeSignIn(input: {
  tokens: GoogleTokens;
  profile: GoogleUserInfo;
  next: string | null;
}): Promise<{ user: User; destination: string }> {
  const { user, created } = await resolveGoogleUser(input.profile);
  const verified = requireVerifiedProfile(input.profile);
  const canRead = scopeAccess(input.tokens.scope).canRead;

  if (created && canRead) {
    const { mailbox } = await storeMailbox({
      userId: user.id,
      email: verified.email,
      providerAccountId: verified.sub,
      tokens: input.tokens,
    });
    await rememberActiveMailbox(user.id, mailbox.id);
  } else if (canRead) {
    const existing = await findMailboxForGoogleAccount(user.id, verified);
    if (existing) {
      await refreshMailboxTokens(existing, {
        email: verified.email,
        providerAccountId: verified.sub,
        tokens: input.tokens,
      });
    }
  }

  const destination = (await hasMailbox(user.id)) ? input.next ?? "/dashboard" : "/connect";
  return { user, destination };
}

/** Where a mailbox trip ends when it did not work out. */
export async function mailboxFailure(
  context: OAuthContext,
  user: Pick<User, "id">,
  reason: MailboxError,
): Promise<ConsentOutcome> {
  if (context.access === "organise") {
    // Clear out's permission request reports on the Clear out page, as before.
    const outcome =
      reason === "cancelled" ? "cancelled" : reason === "wrong_account" ? "wrong_account" : "failed";
    return organiseOutcome(context, outcome);
  }
  return { path: await landing(context, user), params: { [MAILBOX_ERROR_PARAM]: reason } };
}

/**
 * Adding a mailbox, or reconnecting one.
 *
 * Reconnecting is for the exact mailbox named when the trip started: it must
 * still be the user's, and Google must answer as the same Google account —
 * otherwise nothing is stored. Gmail access is read from what Google actually
 * granted (people can untick permissions); without it nothing is stored
 * either, so a working grant is never replaced by a weaker one.
 *
 * Adding never changes the profile's Google sign-in. If the profile has none
 * and this is its own address, that Google account may sign in from now on.
 */
export async function completeMailboxConsent(input: {
  context: OAuthContext;
  user: User;
  tokens: GoogleTokens;
  profile: GoogleUserInfo;
}): Promise<ConsentOutcome> {
  const { context, user, tokens, profile } = input;
  const verified = requireVerifiedProfile(profile);
  const access = scopeAccess(tokens.scope);

  if (context.intent === "reconnect") {
    const target = context.mailboxId ? await findOwnedMailbox(user.id, context.mailboxId) : null;
    if (!target) return mailboxFailure(context, user, "not_found");
    if (!sameGoogleAccount(target, verified)) return mailboxFailure(context, user, "wrong_account");
    if (!access.canRead) {
      return context.access === "organise"
        ? organiseOutcome(context, "declined")
        : mailboxFailure(context, user, "missing_permissions");
    }

    await refreshMailboxTokens(target, {
      email: verified.email,
      providerAccountId: verified.sub,
      tokens,
    });

    if (context.access === "organise") {
      return organiseOutcome(context, access.canOrganise ? "granted" : "declined");
    }
    return { path: await landing(context, user), params: { [MAILBOX_STATUS_PARAM]: "reconnected" } };
  }

  if (context.intent !== "add") return mailboxFailure(context, user, "failed");
  if (!access.canRead) return mailboxFailure(context, user, "missing_permissions");

  const { mailbox, created } = await storeMailbox({
    userId: user.id,
    email: verified.email,
    providerAccountId: verified.sub,
    tokens,
  });
  await linkGoogleSignInIfUnset(user.id, profile);
  await rememberActiveMailbox(user.id, mailbox.id);

  return {
    path: await landing(context, user),
    params: {
      [MAILBOX_PARAM]: mailbox.id,
      [MAILBOX_STATUS_PARAM]: created ? "added" : "already_connected",
    },
  };
}

/** Back where the person started; with no mailbox left, the connect step. */
async function landing(context: OAuthContext, user: Pick<User, "id">): Promise<string> {
  if (!(await hasMailbox(user.id))) return "/connect";
  return context.next ?? (context.intent === "reconnect" ? "/settings" : "/dashboard");
}

function organiseOutcome(
  context: OAuthContext,
  outcome: "granted" | "declined" | "cancelled" | "wrong_account" | "failed",
): ConsentOutcome {
  return {
    path: context.next ?? "/clear-out",
    params: {
      access: outcome,
      ...(context.mailboxId ? { [MAILBOX_PARAM]: context.mailboxId } : {}),
    },
  };
}
