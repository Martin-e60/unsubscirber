import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailAccounts, type MailAccount } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { refreshAccessToken, TokenRefreshError } from "@/lib/google/oauth";

/**
 * Access token management.
 *
 * Google access tokens live about an hour. Rather than checking expiry at
 * every call site, everything goes through `getValidAccessToken()`, which
 * refreshes and re-persists the token when it is close to expiring.
 */

/** Refresh this many milliseconds before actual expiry, to avoid races. */
const REFRESH_MARGIN_MS = 60_000;

export async function getValidAccessToken(account: MailAccount): Promise<string> {
  const stillValid = account.expiresAt - REFRESH_MARGIN_MS > Date.now();
  if (stillValid) return decrypt(account.accessTokenEnc);

  if (!account.refreshTokenEnc) {
    throw new TokenRefreshError(
      "This mailbox has no refresh token stored. Reconnect the account.",
      "no_refresh_token",
    );
  }

  const refreshed = await refreshAccessToken(decrypt(account.refreshTokenEnc));

  await db
    .update(mailAccounts)
    .set({
      accessTokenEnc: encrypt(refreshed.accessToken),
      expiresAt: refreshed.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(mailAccounts.id, account.id));

  return refreshed.accessToken;
}
