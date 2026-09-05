import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SenderWorkspace } from "@/components/SenderWorkspace";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";
import { SENDER_STATUS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function CleanupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!(await getPrimaryAccount(user.id))) redirect("/api/auth/google/start");

  return (
    <AppShell>
      <PageHeader
        title="Cleanup"
        subtitle="Everything still waiting on a decision. Keep it, roll it into a digest, or leave the list."
      />
      <SenderWorkspace
        initialStatus={SENDER_STATUS.ACTIVE}
        showScan
        emptyTitle="Nothing to clean up"
        emptyDescription="Run a scan to look further back through your mailbox."
      />
    </AppShell>
  );
}
