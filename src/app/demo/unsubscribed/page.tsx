import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { SenderWorkspace } from "@/components/senders/SenderWorkspace";
import { HistoryList } from "@/components/views/HistoryList";
import { SENDER_STATUS } from "@/lib/constants";

export const metadata: Metadata = { title: "Unsubscribed (demo) — Tidely" };


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

export default async function DemoUnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const initialStatus = tabFrom((await searchParams).status);

  return (
    <>
      <PageHeader
        title="Unsubscribed"
        subtitle="Confirmed removals, requests sent, and attempts that need your attention."
      />
      <SenderWorkspace
        initialStatus={initialStatus}
        tabs={[...TABS]}
        emptyTitle="No senders in this view yet"
        emptyDescription="Unsubscribe from something in Cleanup and the outcome shows up here."
      />
      <HistoryList />
    </>
  );
}
