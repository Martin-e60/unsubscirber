import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SenderWorkspace } from "@/components/senders/SenderWorkspace";
import { HistoryList } from "@/components/views/HistoryList";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";
import { SENDER_STATUS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** The tabs on the results page, and the only values ?status= may select. */
const TABS = [
  SENDER_STATUS.UNSUBSCRIBED,
  SENDER_STATUS.REQUESTED,
  SENDER_STATUS.MANUAL,
  SENDER_STATUS.FAILED,
] as const;

type Tab = (typeof TABS)[number];

function tabFrom(value: string | undefined): Tab {
  return (TABS as readonly string[]).includes(value ?? "")
    ? (value as Tab)
    : SENDER_STATUS.UNSUBSCRIBED;
}

/** ?status=MANUAL or ?status=FAILED opens straight onto that tab — Home links here. */
export default async function UnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const initialStatus = tabFrom((await searchParams).status);
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await getPrimaryAccount(user.id))) redirect("/connect");

  return (
    <AppShell>
      <PageHeader
        title="Unsubscribed"
        subtitle="Confirmed removals, requests sent, and attempts that need your attention."
      />
      <SenderWorkspace
        initialStatus={initialStatus}
        tabs={[...TABS]}
        emptyTitle="No senders match this view"
        emptyDescription="Email requests appear under Requests sent. Sending a request does not confirm removal from the list."
      />
      <HistoryList />
    </AppShell>
  );
}
