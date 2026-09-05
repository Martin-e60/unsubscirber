import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SenderWorkspace } from "@/components/senders/SenderWorkspace";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";
import { SENDER_STATUS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function CleanupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await getPrimaryAccount(user.id))) redirect("/connect");

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
