import { clearSessionCookie } from "@/lib/session";
import { json, route } from "@/lib/api/respond";

export const POST = route(async () => {
  await clearSessionCookie();
  return json({ ok: true });
});
