import { z } from "zod";
import { requireUserAndMailbox } from "@/lib/api/auth";
import { json, readJsonRequest, route } from "@/lib/api/respond";
import type { ClearOutMessageDto } from "@/lib/api/types";
import { isMessageId } from "@/lib/clearout/actions";
import { LIST_HEADERS, toMessageDto } from "@/lib/clearout/map";
import { requireRead, userLabels, withOrganiser } from "@/lib/clearout/server";

/**
 * Rows for ids already selected — what the review dialog lists before an
 * archive or a move to Trash, a few dozen at a time. Read-only.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ids: z.array(z.string().refine(isMessageId)).min(1).max(50),
});

export const POST = route(async (request: Request) => {
  const { account } = await requireUserAndMailbox(request);
  requireRead(account);

  const { ids } = bodySchema.parse(await readJsonRequest(request));

  const { labels, metadata } = await withOrganiser(account, async (organiser) => {
    const [labels, metadata] = await Promise.all([
      userLabels(organiser),
      organiser.getMetadata(ids, LIST_HEADERS),
    ]);
    return { labels, metadata };
  });

  return json<ClearOutMessageDto[]>(
    metadata
      .filter((meta) => meta !== null)
      .map((meta) =>
        toMessageDto(meta, {
          labels,
          accountEmail: account.email,
          provider: account.provider,
          attachmentsKnown: false,
        }),
      ),
  );
});
