import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";
import { json, route } from "@/lib/api/respond";
import type { SessionDto } from "@/lib/api/types";

/** Who am I, and which mailbox is connected? The app's first request. */

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await getCurrentUser();

  if (!user) {
    return json<SessionDto>({ user: null, account: null });
  }

  const account = await getPrimaryAccount(user.id);

  return json<SessionDto>({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
    account: account
      ? { id: account.id, email: account.email, provider: account.provider }
      : null,
  });
});
