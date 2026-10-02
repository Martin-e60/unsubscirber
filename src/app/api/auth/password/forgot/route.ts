import { HttpError, json, readJson, route } from "@/lib/api/respond";
import { requireAuthOrigin } from "@/lib/auth/credentials";
import { requestPasswordReset } from "@/lib/auth/password-reset";
import { passwordRecoveryAvailable, sendSystemEmail } from "@/lib/mail/system";

/**
 * "Forgot password?": always the same answer, whether or not the address has
 * an account, and it takes about the same time either way, so neither the
 * reply nor its speed tells anyone who is signed up.
 */

export const dynamic = "force-dynamic";

const MIN_RESPONSE_MS = 900;

export const POST = route(async (request: Request) => {
  requireAuthOrigin(request);
  if (!passwordRecoveryAvailable()) {
    throw new HttpError("Password reset isn’t available right now.", 503);
  }

  const started = Date.now();
  const body = (await readJson(request)) as { email?: unknown } | null;

  try {
    await requestPasswordReset(body?.email, sendSystemEmail);
  } catch (error) {
    // A bad address or too many requests is the person's to fix, and says
    // nothing about any account. A delivery failure is logged, not shown.
    if (error instanceof HttpError) throw error;
    console.error("[auth/password/forgot] reset email not sent", {
      reason: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
  }

  const wait = MIN_RESPONSE_MS - (Date.now() - started);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  return json({ ok: true });
});
