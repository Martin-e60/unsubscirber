import { json, readJson, route } from "@/lib/api/respond";
import { requireAuthOrigin } from "@/lib/auth/credentials";
import { resetPassword } from "@/lib/auth/password-reset";
import { clearSessionCookie } from "@/lib/session";

/**
 * Choosing a new password from a reset link. Sessions from before the change
 * stop working everywhere; this browser signs in again with the new one.
 */

export const dynamic = "force-dynamic";

export const POST = route(async (request: Request) => {
  requireAuthOrigin(request);
  await resetPassword(await readJson(request));
  await clearSessionCookie();
  return json({ ok: true });
});
