import { json, readJson, route } from "@/lib/api/respond";
import { loginWithPassword, requireAuthOrigin } from "@/lib/auth/credentials";
import { safeNextPath } from "@/lib/auth/next";
import { createSession, setSessionCookie } from "@/lib/session";
import { getPrimaryAccount } from "@/lib/api/auth";

/**
 * Email and password sign-in. Signing in never connects a mailbox: someone
 * without one goes to /connect first, wherever they were heading. Otherwise
 * they return to the page that asked them to sign in, if it is a safe
 * internal path, or to Home.
 */
export const POST = route(async (request: Request) => {
  requireAuthOrigin(request);
  const body = await readJson(request);
  const userId = await loginWithPassword(body);
  await setSessionCookie(await createSession(userId));
  const next = safeNextPath((body as { next?: unknown } | null)?.next);
  return json({ redirectTo: (await getPrimaryAccount(userId)) ? (next ?? "/dashboard") : "/connect" });
});
