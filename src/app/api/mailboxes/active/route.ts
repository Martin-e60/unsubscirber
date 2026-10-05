import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { json, readJsonRequest, route } from "@/lib/api/respond";
import { rememberActiveMailbox } from "@/lib/mailbox/server";
import { isMailboxId } from "@/lib/mailbox/shared";

/**
 * Remembers the mailbox picked in the switcher, so the next visit — on any
 * device — opens on it. It changes nothing for tabs already open: each of
 * those keeps naming its own mailbox on every request.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ mailboxId: z.string().refine(isMailboxId) });

export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const body = bodySchema.parse(await readJsonRequest(request));
  const mailbox = await rememberActiveMailbox(user.id, body.mailboxId);
  return json({ activeMailboxId: mailbox.id });
});
