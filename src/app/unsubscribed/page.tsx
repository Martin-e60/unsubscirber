import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { UnsubscribedView } from "@/components/unsubscribed/UnsubscribedView";
import { getCurrentUser, hasMailbox } from "@/lib/api/auth";
import { cleanupHref, unconfirmedStatus } from "@/lib/navigation";
import { loginHref } from "@/lib/auth/next";

export const dynamic = "force-dynamic";

/**
 * The archive of confirmed unsubscribes.
 *
 * Requests sent, attempts that need a click, and failures used to be tabs
 * here. They are not confirmed unsubscribes, so they are filters in Cleanup's
 * To review view; old links such as ?status=MANUAL are sent straight there.
 */
export default async function UnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const moved = unconfirmedStatus((await searchParams).status);
  if (moved) redirect(cleanupHref("", { status: moved }));

  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/unsubscribed"));
  if (!(await hasMailbox(user.id))) redirect("/connect");

  return (
    <AppShell>
      <UnsubscribedView />
    </AppShell>
  );
}
