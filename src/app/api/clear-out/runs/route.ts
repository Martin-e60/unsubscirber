import { z } from "zod";
import { requireUserAndMailbox } from "@/lib/api/auth";
import { HttpError, json, readJsonRequest, route } from "@/lib/api/respond";
import type { ClearOutRunDto } from "@/lib/api/types";
import { CLEAR_OUT_ACTIONS, MAX_SELECTION } from "@/lib/clearout/actions";
import { isLabelId } from "@/lib/clearout/filters";
import {
  createRun,
  listRuns,
  requireOrganise,
  toRunDto,
  userLabels,
  withOrganiser,
} from "@/lib/clearout/server";

/**
 * Clear out's History, and the start of a new action.
 *
 * GET lists this mailbox's past actions, newest first. POST records that an
 * action is starting over a reviewed number of emails; the emails themselves
 * are then sent in batches to /api/clear-out/runs/<id>, and only what Gmail
 * confirms is counted.
 */

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const { account } = await requireUserAndMailbox(request);
  return json<ClearOutRunDto[]>((await listRuns(account.id)).map(toRunDto));
});

const bodySchema = z.object({
  action: z.enum(CLEAR_OUT_ACTIONS),
  requested: z.number().int().min(1).max(MAX_SELECTION),
  labelId: z.string().refine(isLabelId).nullable().optional(),
});

export const POST = route(async (request: Request) => {
  const { account } = await requireUserAndMailbox(request);
  requireOrganise(account);

  const body = bodySchema.parse(await readJsonRequest(request));

  let labelName: string | null = null;
  if (body.action === "label") {
    if (!body.labelId) throw new HttpError("Choose a label first.", 400);
    const labels = await withOrganiser(account, userLabels);
    labelName = labels.get(body.labelId) ?? null;
    // Only the person's own labels: never INBOX, TRASH, SPAM or another system label.
    if (!labelName) throw new HttpError("That label no longer exists in Gmail.", 404);
  }

  const run = await createRun(account.id, {
    action: body.action,
    requested: body.requested,
    labelId: body.action === "label" ? body.labelId ?? null : null,
    labelName,
  });
  return json<ClearOutRunDto>(toRunDto(run), 201);
});
