import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAccount, requireUser } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import {
  countByStatus,
  listSenders,
  manualUrlsFor,
  toSenderDto,
} from "@/lib/api/senders";
import { SENDER_STATUS } from "@/lib/constants";
import type { SendersResponse } from "@/lib/api/types";

/** The main list: every subscription found, filtered and sorted. */

export const dynamic = "force-dynamic";

/** "ALL" is a filter option, not a stored status, so it is listed explicitly. */
const statusFilter = z
  .enum([
    SENDER_STATUS.ACTIVE,
    SENDER_STATUS.KEPT,
    SENDER_STATUS.ROLLED_UP,
    SENDER_STATUS.UNSUBSCRIBING,
    SENDER_STATUS.UNSUBSCRIBED,
    SENDER_STATUS.FAILED,
    SENDER_STATUS.MANUAL,
    "ALL",
  ])
  .default(SENDER_STATUS.ACTIVE);

const querySchema = z.object({
  status: statusFilter,
  search: z.string().optional(),
  sort: z.enum(["count", "recent", "name"]).default("count"),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export const GET = route(async (request: NextRequest) => {
  const user = await requireUser();
  const account = await requireAccount(user.id);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = querySchema.parse(params);

  const { rows, total } = await listSenders({
    mailAccountId: account.id,
    status: query.status,
    search: query.search,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
  });

  const manualIds = rows
    .filter((row) => row.status === SENDER_STATUS.MANUAL)
    .map((row) => row.id);
  const manualUrls = await manualUrlsFor(manualIds);

  return json<SendersResponse>({
    senders: rows.map((row) => toSenderDto(row, manualUrls.get(row.id) ?? null)),
    counts: await countByStatus(account.id),
    total,
  });
});
