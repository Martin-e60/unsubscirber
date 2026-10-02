import { requireAccount, requireUser } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import type { ClearOutLabelDto } from "@/lib/api/types";
import { requireRead, userLabels, withOrganiser } from "@/lib/clearout/server";

/** The person's own Gmail labels, for the scope menu and the Label action. */

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  const account = await requireAccount(user.id);
  requireRead(account);

  const labels = await withOrganiser(account, userLabels);
  return json<ClearOutLabelDto[]>([...labels].map(([id, name]) => ({ id, name })));
});
