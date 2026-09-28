import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { SenderWorkspace } from "@/components/senders/SenderWorkspace";
import { HistoryList } from "@/components/views/HistoryList";
import { SENDER_STATUS } from "@/lib/constants";

export const metadata: Metadata = { title: "Unsubscribed (demo) — Tidely" };

export default function DemoUnsubscribedPage() {
  return (
    <>
      <PageHeader
        title="Unsubscribed"
        subtitle="Confirmed removals, requests sent, and attempts that need your attention."
      />
      <SenderWorkspace
        initialStatus={SENDER_STATUS.UNSUBSCRIBED}
        tabs={[
          SENDER_STATUS.UNSUBSCRIBED,
          SENDER_STATUS.REQUESTED,
          SENDER_STATUS.MANUAL,
          SENDER_STATUS.FAILED,
        ]}
        emptyTitle="No senders in this view yet"
        emptyDescription="Unsubscribe from something in Cleanup and the outcome shows up here."
      />
      <HistoryList />
    </>
  );
}
