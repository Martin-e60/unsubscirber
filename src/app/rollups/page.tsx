import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SenderWorkspace } from "@/components/senders/SenderWorkspace";
import { Notice } from "@/components/ui/Notice";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";
import { SENDER_STATUS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function RollupsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await getPrimaryAccount(user.id))) redirect("/connect");

  return (
    <AppShell>
      <PageHeader
        title="Rollups"
        subtitle="Senders you want bundled into one digest instead of arriving one at a time."
      />
      <Notice tone="info">
        Senders are being collected here, but the digest email is not sending
        yet — that part is still to build.
      </Notice>
      <SenderWorkspace
        initialStatus={SENDER_STATUS.ROLLED_UP}
        showTabs={false}
        emptyTitle="No rollups yet"
        emptyDescription="Choose Roll up on any sender to bundle it here instead of unsubscribing."
      />
    </AppShell>
  );
}
