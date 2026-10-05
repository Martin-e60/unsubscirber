import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserAndMailbox } from "@/lib/api/auth";
import { HttpError, json, route } from "@/lib/api/respond";
import type { ClearOutListResponse } from "@/lib/api/types";
import { gmailSearch, MAX_UNSUBSCRIBED_CLAUSES } from "@/lib/clearout/filters";
import { LIST_HEADERS, toMessageDto } from "@/lib/clearout/map";
import {
  queryFrom,
  requireRead,
  unsubscribedLists,
  userLabels,
  withOrganiser,
} from "@/lib/clearout/server";

/**
 * One page of Clear out's list: individual messages matching the filters,
 * newest first — the only order Gmail search returns, so the only one offered.
 *
 * Bounded: one search call and one metadata call per row on the page. Bodies
 * and attachments are never downloaded. Reading never changes the mail, and
 * metadata requests do not mark anything as read.
 */

export const dynamic = "force-dynamic";

const pageSchema = z.object({
  pageToken: z.string().max(512).regex(/^[A-Za-z0-9_-]*$/).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  /** How many messages came before this page, so the last page knows the exact total. */
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const GET = route(async (request: NextRequest) => {
  const { account } = await requireUserAndMailbox(request);
  requireRead(account);

  const params = new URL(request.url).searchParams;
  const query = queryFrom(params);
  const page = pageSchema.parse({
    pageToken: params.get("pageToken") ?? undefined,
    pageSize: params.get("pageSize") ?? undefined,
    offset: params.get("offset") ?? undefined,
  });

  const lists = query.unsubscribed ? await unsubscribedLists(account.id) : [];
  const search = gmailSearch(query, lists);

  if (!search) {
    return json<ClearOutListResponse>({
      messages: [],
      nextPageToken: null,
      total: 0,
      totalExact: true,
      notes: ["You haven’t confirmed an unsubscribe from any list yet."],
    });
  }

  const result = await withOrganiser(account, async (organiser) => {
    const [labels, found] = await Promise.all([
      userLabels(organiser),
      organiser.searchMessages({
        q: search.q,
        labelIds: search.labelIds,
        pageToken: page.pageToken || null,
        maxResults: page.pageSize,
      }),
    ]);
    if (query.label && !labels.has(query.label)) {
      throw new HttpError("That label no longer exists in Gmail.", 404);
    }
    const metadata = await organiser.getMetadata(found.ids, LIST_HEADERS);
    return { labels, found, metadata };
  });

  const messages = result.metadata
    .filter((meta) => meta !== null)
    .map((meta) =>
      toMessageDto(meta, {
        labels: result.labels,
        accountEmail: account.email,
        provider: account.provider,
        attachmentsKnown: query.attachments,
      }),
    );

  const notes: string[] = [];
  const unreadable = result.metadata.length - messages.length;
  if (unreadable > 0) {
    notes.push(`${unreadable} ${unreadable === 1 ? "email" : "emails"} on this page couldn’t be loaded.`);
  }
  if (search.truncatedLists) {
    notes.push(`From unsubscribed covers the first ${MAX_UNSUBSCRIBED_CLAUSES} lists you left.`);
  }

  const last = result.found.nextPageToken === null;
  const counted = page.offset + result.found.ids.length;

  return json<ClearOutListResponse>({
    messages,
    nextPageToken: result.found.nextPageToken,
    // Gmail only estimates. On the last page the true number is known.
    total: last ? counted : Math.max(result.found.estimate, counted),
    totalExact: last,
    notes,
  });
});
