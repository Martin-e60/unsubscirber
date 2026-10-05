import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import { listMailboxes, mailboxForRequest, removeMailbox, revokeIfUnshared } from "@/lib/mailbox/server";
import { clearSessionCookie } from "@/lib/session";

/**
 * Two different kinds of removal, kept apart on purpose.
 *
 * `DELETE /api/account` disconnects one mailbox — the one the request names
 * in its X-Tidely-Mailbox header (it must name one: this changes data). The
 * token is revoked with Google and the mail account row is deleted, which
 * cascades to every sender, scan and unsubscribe attempt belonging to it.
 * Other mailboxes and the Tidely login stay. Settings now uses
 * DELETE /api/mailboxes/<id>, which does the same; this stays for any page
 * still open from before multiple mailboxes.
 *
 * `DELETE /api/account?scope=user` deletes the Tidely profile itself — the
 * user row, with the email address, name and the link to the Google account
 * — and signs the session out. That row cascades to every mailbox, so this
 * is a superset; each mailbox's Google grant is revoked first.
 *
 * The distinction matters because the Settings screen used to offer one button
 * that claimed to delete everything while leaving the user row in place. Saying
 * so and not doing it is worse than not offering it.
 */

export const dynamic = "force-dynamic";

export const DELETE = route(async (request: Request) => {
  const user = await requireUser();
  const everything = new URL(request.url).searchParams.get("scope") === "user";

  if (everything) {
    // Best effort: a token Google has already forgotten must not block removal.
    for (const mailbox of await listMailboxes(user.id)) await revokeIfUnshared(mailbox);
    await db.delete(users).where(eq(users.id, user.id));
    await clearSessionCookie();
    return json({ ok: true, deleted: "user" });
  }

  const mailbox = await mailboxForRequest(request, user);
  const result = await removeMailbox(user.id, mailbox.id);
  return json({ ok: true, deleted: "mailbox", activeMailboxId: result.activeMailboxId });
});
