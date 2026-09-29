import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { SenderWorkspace } from "@/components/senders/SenderWorkspace";
import { senderFilter } from "@/lib/navigation";

export const metadata: Metadata = { title: "Senders (demo) — Tidely" };

export default async function DemoSendersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const { search, status } = await searchParams;

  return (
    <>
      <PageHeader title="Senders" subtitle="Everyone who has emailed you a list." />
      <SenderWorkspace
        // ?status= opens a tab directly, e.g. Needs a click from Home.
        key={senderFilter(status)}
        initialStatus={senderFilter(status)}
        initialSearch={search ?? ""}
        emptyTitle="No senders match"
        emptyDescription="Try a different search, or scan a longer time range from Cleanup."
      />
    </>
  );
}
