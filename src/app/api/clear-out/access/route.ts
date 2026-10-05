import { requireUserAndMailbox } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import type { ClearOutAccessDto } from "@/lib/api/types";
import { accessFor } from "@/lib/clearout/server";

/**
 * What the connected mailbox has allowed: searching (read access) and
 * organising (modify access). Read from the grant Google returned, so the
 * page can ask for the missing permission before an action fails.
 */

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const { account } = await requireUserAndMailbox(request);
  return json<ClearOutAccessDto>(accessFor(account));
});
