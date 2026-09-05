import type { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { scans } from "@/db/schema";
import { requireAccount, requireUser } from "@/lib/api/auth";
import { HttpError, json, route } from "@/lib/api/respond";
import { runScanStep, toProgress } from "@/lib/scan/engine";
import type { ScanProgressDto } from "@/lib/api/types";

/**
 * Processes one page of the mailbox.
 *
 * The browser calls this in a loop until `done` comes back true. Each call is
 * short, so nothing times out and progress is real.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ scanId: z.string().optional() });

export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  const account = await requireAccount(user.id);

  const body = bodySchema.parse(await request.json().catch(() => ({})));

  const [scan] = body.scanId
    ? await db
        .select()
        .from(scans)
        .where(and(eq(scans.id, body.scanId), eq(scans.mailAccountId, account.id)))
        .limit(1)
    : await db
        .select()
        .from(scans)
        .where(eq(scans.mailAccountId, account.id))
        .orderBy(desc(scans.startedAt))
        .limit(1);

  if (!scan) throw new HttpError("No scan to continue. Start one first.", 404);

  return json<ScanProgressDto>(await runScanStep(account, scan));
});
