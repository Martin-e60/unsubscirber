import { requireUserAndMailbox } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import { computeStats } from "@/lib/api/stats";
import type { StatsDto } from "@/lib/api/types";

/** The Home screen's three stat cards. */

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const { account } = await requireUserAndMailbox(request);

  return json<StatsDto>(await computeStats(account.id));
});
