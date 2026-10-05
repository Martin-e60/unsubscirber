import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { scans } from "@/db/schema";
import { requireUserAndMailbox } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import { toProgress } from "@/lib/scan/engine";
import type { ScanProgressDto } from "@/lib/api/types";

/**
 * The most recent scan, or null if the mailbox has never been scanned.
 *
 * This is what lets a scan survive a page refresh: the browser reads the
 * current state on load and picks the loop back up if it was still running.
 */

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const { account } = await requireUserAndMailbox(request);

  const [scan] = await db
    .select()
    .from(scans)
    .where(eq(scans.mailAccountId, account.id))
    .orderBy(desc(scans.startedAt))
    .limit(1);

  return json<ScanProgressDto | null>(scan ? toProgress(scan) : null);
});
