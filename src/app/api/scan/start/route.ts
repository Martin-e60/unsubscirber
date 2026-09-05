import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAccount, requireUser } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import { startScan, toProgress } from "@/lib/scan/engine";
import type { ScanProgressDto } from "@/lib/api/types";

/** Begins a scan. The browser then calls /api/scan/step until it is done. */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  lookbackDays: z.coerce.number().int().min(1).max(3650).default(365),
});

export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  const account = await requireAccount(user.id);

  const body = bodySchema.parse(await request.json().catch(() => ({})));
  const scan = await startScan(account, body.lookbackDays);

  return json<ScanProgressDto>(toProgress(scan));
});
