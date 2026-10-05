import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { HttpError, json, readJsonRequest, route } from "@/lib/api/respond";
import type { MailboxDto, MailboxesResponse } from "@/lib/api/types";
import { removeMailbox, renameMailbox, toMailboxDto } from "@/lib/mailbox/server";
import { normaliseMailboxLabel } from "@/lib/mailbox/shared";

/**
 * One connected mailbox.
 *
 * PATCH renames it — the name is the person's own, e.g. "Work"; the app never
 * guesses one. DELETE disconnects it: revokes Tidely's Google grant and
 * deletes that mailbox's senders, scans, attempts and Clear out History. The
 * other mailboxes and the Tidely login stay exactly as they were. Deleting
 * the whole Tidely profile is a different endpoint, DELETE /api/account?scope=user.
 */

export const dynamic = "force-dynamic";

const patchSchema = z.object({ label: z.string().max(200).nullable() });

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const body = patchSchema.parse(await readJsonRequest(request));

  const label = normaliseMailboxLabel(body.label);
  if (!label.ok) throw new HttpError(label.error, 400);

  return json<MailboxDto>(toMailboxDto(await renameMailbox(user.id, id, label.label)));
});

export const DELETE = route(async (_request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const result = await removeMailbox(user.id, id);
  return json<MailboxesResponse & { removed: string }>({
    removed: result.removed.id,
    mailboxes: result.remaining.map(toMailboxDto),
    activeMailboxId: result.activeMailboxId,
  });
});
