import { requireAccount, requireUser } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import type { ClearOutAccessDto } from "@/lib/api/types";
import { accessFor } from "@/lib/clearout/server";

/**
 * What the connected mailbox has allowed: searching (read access) and
 * organising (modify access). Read from the grant Google returned, so the
 * page can ask for the missing permission before an action fails.
 */

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  const account = await requireAccount(user.id);
  return json<ClearOutAccessDto>(accessFor(account));
});
