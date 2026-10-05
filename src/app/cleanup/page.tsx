import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { CleanupView } from "@/components/cleanup/CleanupView";
import { getCurrentUser, hasMailbox } from "@/lib/api/auth";
import { loginHref } from "@/lib/auth/next";

export const dynamic = "force-dynamic";

/**
 * Cleanup. The view is read from the URL on the client: ?view=keeping,
 * ?status=MANUAL|FAILED|REQUESTED, and ?review=<sender id> for "Review in
 * Cleanup" from Unsubscribed.
 */
export default async function CleanupPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/cleanup"));
  if (!(await hasMailbox(user.id))) redirect("/connect");

  return (
    <AppShell>
      <Suspense>
        <CleanupView />
      </Suspense>
    </AppShell>
  );
}
