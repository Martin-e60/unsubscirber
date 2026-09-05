import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { senders } from "@/db/schema";
import { requireAccount, requireUser } from "@/lib/api/auth";
import { HttpError, json, route } from "@/lib/api/respond";
import { unsubscribeSender } from "@/lib/unsubscribe/engine";
import type { UnsubscribeResultDto } from "@/lib/api/types";

/**
 * Unsubscribes from one sender.
 *
 * Deliberately one at a time: the browser fires several of these in parallel
 * so each row in the list updates the moment its own request finishes, instead
 * of the whole selection freezing until the slowest sender responds.
 */

export const dynamic = "force-dynamic";
/** Some unsubscribe endpoints are slow. Give a single attempt room to breathe. */
export const maxDuration = 60;

const bodySchema = z.object({ senderId: z.string().min(1) });

export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  const account = await requireAccount(user.id);

  const body = bodySchema.parse(await request.json());

  const [sender] = await db
    .select()
    .from(senders)
    .where(
      and(eq(senders.id, body.senderId), eq(senders.mailAccountId, account.id)),
    )
    .limit(1);

  if (!sender) throw new HttpError("Sender not found.", 404);

  return json<UnsubscribeResultDto>(await unsubscribeSender(account, sender));
});
