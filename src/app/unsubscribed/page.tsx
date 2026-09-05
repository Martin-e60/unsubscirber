import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SenderWorkspace } from "@/components/senders/SenderWorkspace";
import { HistoryList } from "@/components/views/HistoryList";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";
import { SENDER_STATUS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function UnsubscribedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await getPrimaryAccount(user.id))) redirect("/connect");

  return (
    <AppShell>
      <PageHeader
        title="Unsubscribed"
        subtitle="Lists you have left, and every attempt we made getting you out."
      />
      <SenderWorkspace
        initialStatus={SENDER_STATUS.UNSUBSCRIBED}
        showTabs={false}
        emptyTitle="Nothing unsubscribed yet"
        emptyDescription="Once you leave a list it shows up here."
      />
      <HistoryList />
    </AppShell>
  );
}
