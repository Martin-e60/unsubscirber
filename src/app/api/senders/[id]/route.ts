import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { senders } from "@/db/schema";
import { requireAccount, requireUser } from "@/lib/api/auth";
import { HttpError, json, readJson, route } from "@/lib/api/respond";
import { toSenderDto } from "@/lib/api/senders";
import { SENDER_STATUS } from "@/lib/constants";

/**
 * Changing a sender's status by hand.
 *
 * Used for "keep this one" and for putting a sender back in the list after
 * changing your mind. Unsubscribing goes through POST /api/unsubscribe.
 */

const bodySchema = z.object({
  status: z.enum([
    SENDER_STATUS.KEPT,
    SENDER_STATUS.ROLLED_UP,
    SENDER_STATUS.ACTIVE,
  ]),
});

export const PATCH = route(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const account = await requireAccount(user.id);
    const { id } = await context.params;

    const body = bodySchema.parse(await readJson(request));

    const [updated] = await db
      .update(senders)
      .set({
        status: body.status,
        // Returning a sender to ACTIVE clears the decision timestamp, so the
        // stats only ever count choices that currently stand.
        decidedAt: body.status === SENDER_STATUS.ACTIVE ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(senders.id, id), eq(senders.mailAccountId, account.id)))
      .returning();

    if (!updated) throw new HttpError("Sender not found.", 404);

    return json(toSenderDto(updated));
  },
);
