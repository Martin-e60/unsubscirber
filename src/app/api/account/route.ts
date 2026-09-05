import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailAccounts } from "@/db/schema";
import { requireAccount, requireUser } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import { decrypt } from "@/lib/crypto";
import { revokeToken } from "@/lib/google/oauth";
import { clearSessionCookie } from "@/lib/session";

/**
 * Disconnects the mailbox.
 *
 * Revokes the token with Google first, then deletes the account row — which
 * cascades to every sender, scan and attempt belonging to it. Nothing of the
 * mailbox is left behind.
 */

export const DELETE = route(async () => {
  const user = await requireUser();
  const account = await requireAccount(user.id);

  if (account.refreshTokenEnc) {
    await revokeToken(decrypt(account.refreshTokenEnc));
  }

  await db.delete(mailAccounts).where(eq(mailAccounts.id, account.id));
  await clearSessionCookie();

  return json({ ok: true });
});
