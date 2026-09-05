import { requireAccount, requireUser } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import { computeStats } from "@/lib/api/stats";
import type { StatsDto } from "@/lib/api/types";

/** The Home screen's three stat cards. */

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  const account = await requireAccount(user.id);

  return json<StatsDto>(await computeStats(account.id));
});
