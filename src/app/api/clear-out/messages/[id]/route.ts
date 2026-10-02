import { requireAccount, requireUser } from "@/lib/api/auth";
import { HttpError, json, route } from "@/lib/api/respond";
import type { ClearOutPreviewDto } from "@/lib/api/types";
import { isMessageId } from "@/lib/clearout/actions";
import { PREVIEW_HEADERS, toPreviewDto } from "@/lib/clearout/map";
import { requireRead, userLabels, withOrganiser } from "@/lib/clearout/server";

/**
 * A lightweight preview: headers, labels and Gmail's snippet — enough to
 * recognise the email. No body is downloaded, and nothing is marked as read.
 */

export const dynamic = "force-dynamic";

export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const account = await requireAccount(user.id);
  requireRead(account);

  const { id } = await context.params;
  if (!isMessageId(id)) throw new HttpError("Email not found.", 404);

  const { labels, meta } = await withOrganiser(account, async (organiser) => {
    const [labels, [meta]] = await Promise.all([
      userLabels(organiser),
      organiser.getMetadata([id], PREVIEW_HEADERS),
    ]);
    return { labels, meta };
  });

  if (!meta) throw new HttpError("That email is no longer in your mailbox.", 404);

  return json<ClearOutPreviewDto>(
    toPreviewDto(meta, {
      labels,
      accountEmail: account.email,
      provider: account.provider,
      attachmentsKnown: false,
    }),
  );
});
