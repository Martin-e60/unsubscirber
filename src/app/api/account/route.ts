import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailAccounts, users } from "@/db/schema";
import { getPrimaryAccount, requireUser } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import { decrypt } from "@/lib/crypto";
import { revokeToken } from "@/lib/google/oauth";
import { clearSessionCookie } from "@/lib/session";

/**
 * Two different kinds of removal, kept apart on purpose.
 *
 * `DELETE /api/account` disconnects the mailbox: the token is revoked with
 * Google and the mail account row is deleted, which cascades to every sender,
 * scan and unsubscribe attempt belonging to it. The Tidely login itself stays,
 * so the person can connect a mailbox again without signing up twice.
 *
 * `DELETE /api/account?scope=user` deletes the account as well — the user row,
 * with the email address, name and the link to the Google account — and signs
 * the session out. That row cascades to the mailbox, so this is a superset.
 *
 * The distinction matters because the Settings screen used to offer one button
 * that claimed to delete everything while leaving the user row in place. Saying
 * so and not doing it is worse than not offering it.
 */

export const dynamic = "force-dynamic";

export const DELETE = route(async (request: Request) => {
  const user = await requireUser();
  const everything = new URL(request.url).searchParams.get("scope") === "user";

  const account = await getPrimaryAccount(user.id);

  if (account?.refreshTokenEnc) {
    // Best effort: a token Google has already forgotten must not block removal.
    try {
      await revokeToken(decrypt(account.refreshTokenEnc));
    } catch (error) {
      console.error("[account] token revoke failed:", error);
    }
  }

  if (everything) {
    await db.delete(users).where(eq(users.id, user.id));
    await clearSessionCookie();
    return json({ ok: true, deleted: "user" });
  }

  if (account) {
    await db.delete(mailAccounts).where(eq(mailAccounts.id, account.id));
  }

  return json({ ok: true, deleted: "mailbox" });
});
