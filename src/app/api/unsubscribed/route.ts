import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserAndMailbox } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import { listArchive } from "@/lib/api/unsubscribed";
import type { UnsubscribedResponse } from "@/lib/api/types";

/** Confirmed unsubscribes, and whether each list has written since. Read-only. */

export const dynamic = "force-dynamic";

const querySchema = z.object({
  search: z.string().max(200).optional(),
  senderId: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export const GET = route(async (request: NextRequest) => {
  const { account } = await requireUserAndMailbox(request);
  const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

  return json<UnsubscribedResponse>(await listArchive({ account, ...query }));
});
