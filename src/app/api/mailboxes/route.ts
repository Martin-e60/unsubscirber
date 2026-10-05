import { requireUser } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import type { MailboxesResponse } from "@/lib/api/types";
import { listMailboxes, rememberedMailbox, toMailboxDto } from "@/lib/mailbox/server";

/** Every mailbox connected to the signed-in Tidely profile, oldest first. */

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  const [rows, active] = await Promise.all([listMailboxes(user.id), rememberedMailbox(user)]);
  return json<MailboxesResponse>({
    mailboxes: rows.map(toMailboxDto),
    activeMailboxId: active?.id ?? null,
  });
});
