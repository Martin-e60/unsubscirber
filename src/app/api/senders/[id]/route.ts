import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAccount, requireUser } from "@/lib/api/auth";
import { json, readJson, route } from "@/lib/api/respond";
import { changeSenderStatus } from "@/lib/api/senders";
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

    return json(await changeSenderStatus(account.id, id, body.status));
  },
);
