import { getCurrentUser } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import type { SessionDto } from "@/lib/api/types";
import { listMailboxes, rememberedMailbox, toMailboxDto } from "@/lib/mailbox/server";

/**
 * Who am I, and which mailboxes are connected? The app's first request.
 *
 * `activeMailboxId` is only where a new tab starts. The tab then names its
 * mailbox on every request, so switching in one tab never moves another.
 */

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await getCurrentUser();

  if (!user) {
    return json<SessionDto>({ user: null, mailboxes: [], activeMailboxId: null, account: null });
  }

  const [rows, active] = await Promise.all([listMailboxes(user.id), rememberedMailbox(user)]);

  return json<SessionDto>({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
    mailboxes: rows.map(toMailboxDto),
    activeMailboxId: active?.id ?? null,
    account: active
      ? { id: active.id, email: active.email, provider: active.provider }
      : null,
  });
});
