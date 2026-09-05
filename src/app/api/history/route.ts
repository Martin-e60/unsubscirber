import type { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { senders, unsubscribeAttempts } from "@/db/schema";
import { requireAccount, requireUser } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import type { HistoryItemDto } from "@/lib/api/types";

/** Every unsubscribe attempt, newest first. Successes and failures alike. */

export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const GET = route(async (request: NextRequest) => {
  const user = await requireUser();
  const account = await requireAccount(user.id);

  const query = querySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );

  const rows = await db
    .select({
      attempt: unsubscribeAttempts,
      sender: senders,
    })
    .from(unsubscribeAttempts)
    .innerJoin(senders, eq(unsubscribeAttempts.senderId, senders.id))
    .where(eq(senders.mailAccountId, account.id))
    .orderBy(desc(unsubscribeAttempts.createdAt))
    .limit(query.limit);

  return json<HistoryItemDto[]>(
    rows.map(({ attempt, sender }) => ({
      id: attempt.id,
      senderId: sender.id,
      senderAddress: sender.address,
      senderName: sender.name,
      method: attempt.method,
      status: attempt.status,
      detail: attempt.detail,
      createdAt: attempt.createdAt.toISOString(),
    })),
  );
});
