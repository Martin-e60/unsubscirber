import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserAndMailbox } from "@/lib/api/auth";
import { DEFAULT_LOOKBACK_DAYS } from "@/lib/constants";
import { json, readJson, route } from "@/lib/api/respond";
import { startScan, toProgress } from "@/lib/scan/engine";
import type { ScanProgressDto } from "@/lib/api/types";

/** Begins a scan. The browser then calls /api/scan/step until it is done. */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  lookbackDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(3650)
    .default(DEFAULT_LOOKBACK_DAYS),
});

export const POST = route(async (request: NextRequest) => {
  const { account } = await requireUserAndMailbox(request);

  const body = bodySchema.parse(await readJson(request, { allowEmpty: true }));
  const scan = await startScan(account, body.lookbackDays);

  return json<ScanProgressDto>(toProgress(scan));
});
