import { requireUserAndMailbox } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import type { ClearOutLabelDto } from "@/lib/api/types";
import { requireRead, userLabels, withOrganiser } from "@/lib/clearout/server";

/** The person's own Gmail labels, for the scope menu and the Label action. */

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const { account } = await requireUserAndMailbox(request);
  requireRead(account);

  const labels = await withOrganiser(account, userLabels);
  return json<ClearOutLabelDto[]>([...labels].map(([id, name]) => ({ id, name })));
});
