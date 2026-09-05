import { json, readJson, route } from "@/lib/api/respond";
import { loginWithPassword, requireAuthOrigin } from "@/lib/auth/credentials";
import { createSession, setSessionCookie } from "@/lib/session";
import { getPrimaryAccount } from "@/lib/api/auth";

export const POST = route(async (request: Request) => {
  requireAuthOrigin(request);
  const userId = await loginWithPassword(await readJson(request));
  await setSessionCookie(await createSession(userId));
  return json({ redirectTo: await getPrimaryAccount(userId) ? "/dashboard" : "/connect" });
});
