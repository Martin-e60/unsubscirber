import { json, readJson, route } from "@/lib/api/respond";
import { registerWithPassword, requireAuthOrigin } from "@/lib/auth/credentials";
import { createSession, setSessionCookie } from "@/lib/session";

export const POST = route(async (request: Request) => {
  requireAuthOrigin(request);
  const userId = await registerWithPassword(await readJson(request));
  await setSessionCookie(await createSession(userId));
  return json({ redirectTo: "/connect" }, 201);
});
