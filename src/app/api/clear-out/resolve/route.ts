import { z } from "zod";
import { requireUserAndMailbox } from "@/lib/api/auth";
import { json, readJsonRequest, route } from "@/lib/api/respond";
import type { ClearOutResolveResponse } from "@/lib/api/types";
import { gmailSearch } from "@/lib/clearout/filters";
import { queryFrom, requireRead, unsubscribedLists, withOrganiser } from "@/lib/clearout/server";

/**
 * "Select all matching emails": one page of matching ids at a time.
 *
 * The browser calls this in a loop — showing progress and able to stop — so
 * the exact count is known before any action is offered. Ids only: no
 * metadata, nothing changed.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  query: z.record(z.string(), z.unknown()),
  pageToken: z.string().max(512).regex(/^[A-Za-z0-9_-]*$/).nullable().optional(),
});

/** Gmail's largest page. */
const PAGE = 500;

export const POST = route(async (request: Request) => {
  const { account } = await requireUserAndMailbox(request);
  requireRead(account);

  const body = bodySchema.parse(await readJsonRequest(request));
  const query = queryFrom(body.query);
  const search = gmailSearch(query, query.unsubscribed ? await unsubscribedLists(account.id) : []);

  if (!search) {
    return json<ClearOutResolveResponse>({ ids: [], nextPageToken: null, estimate: 0 });
  }

  const found = await withOrganiser(account, (organiser) =>
    organiser.searchMessages({
      q: search.q,
      labelIds: search.labelIds,
      pageToken: body.pageToken || null,
      maxResults: PAGE,
    }),
  );

  return json<ClearOutResolveResponse>(found);
});
