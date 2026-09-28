import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { SenderWorkspace } from "@/components/senders/SenderWorkspace";
import { SENDER_STATUS } from "@/lib/constants";

export const metadata: Metadata = { title: "Cleanup (demo) — Tidely" };

export default function DemoCleanupPage() {
  return (
    <>
      <PageHeader
        title="Cleanup"
        subtitle="Everything still waiting on a decision. Keep it, or leave the list."
      />
      <SenderWorkspace
        initialStatus={SENDER_STATUS.ACTIVE}
        showScan
        emptyTitle="Nothing waiting on a decision"
        emptyDescription="Scan further back to turn up older senders."
      />
    </>
  );
}
