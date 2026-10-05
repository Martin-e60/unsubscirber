import { z } from "zod";
import { requireUserAndMailbox } from "@/lib/api/auth";
import { HttpError, json, readJsonRequest, route } from "@/lib/api/respond";
import type { ClearOutChunkResponse } from "@/lib/api/types";
import { CHUNK_SIZE, isMessageId } from "@/lib/clearout/actions";
import { applyBatch } from "@/lib/clearout/apply";
import { findRun, recordChunk, requireOrganise, toRunDto, withOrganiser } from "@/lib/clearout/server";

/**
 * One batch of a Clear out action.
 *
 * The ids are the reviewed selection, frozen in the browser when the person
 * confirmed; nothing is searched for or added here. Each id is one message:
 * the rest of its conversation is left alone. The run must belong to the
 * signed-in person's mailbox, and its action and label were fixed when it
 * started, so a batch cannot change what is being done.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  ids: z.array(z.string().refine(isMessageId)).min(1).max(500),
  /** True when these ids already failed once in this run. */
  retry: z.boolean().default(false),
});

export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { account } = await requireUserAndMailbox(request);
  requireOrganise(account);

  const { id } = await context.params;
  const run = await findRun(account.id, id);
  if (!run) throw new HttpError("Action not found.", 404);

  const body = bodySchema.parse(await readJsonRequest(request));
  const ids = [...new Set(body.ids)];
  if (ids.length > CHUNK_SIZE[run.action]) throw new HttpError("Too many emails in one batch.", 400);

  const outcome = await withOrganiser(account, (organiser) => applyBatch(organiser, run, ids), "organise");
  const updated = await recordChunk(run, {
    succeeded: outcome.succeeded.length,
    failed: outcome.failed.length,
    retry: body.retry,
  });

  return json<ClearOutChunkResponse>({ run: toRunDto(updated), ...outcome });
});
