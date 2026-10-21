import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { CleanupView } from "@/components/cleanup/CleanupView";
import { getCurrentUser, hasMailbox } from "@/lib/api/auth";
import { loginHref } from "@/lib/auth/next";

export const dynamic = "force-dynamic";

/**
 * Cleanup: senders on the left, the focused sender's decision and messages on
 * the right. What is shown is read from the URL on the client: ?view=keeping,
 * ?status=MANUAL|FAILED|REQUESTED, ?mail=all for All emails, the message
 * filters (?unread=1&older=6m&scope=inbox&q=…, and ?from=<address> to open one
 * sender), and ?review=<sender id> for "Review in Cleanup" from Unsubscribed.
 * Old /clear-out links redirect here.
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
