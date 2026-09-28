import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { SenderWorkspace } from "@/components/senders/SenderWorkspace";

export const metadata: Metadata = { title: "Senders (demo) — Tidely" };

export default async function DemoSendersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;

  return (
    <>
      <PageHeader title="Senders" subtitle="Everyone who has emailed you a list." />
      <SenderWorkspace
        initialStatus="ALL"
        initialSearch={search ?? ""}
        emptyTitle="No senders match"
        emptyDescription="Try a different search, or scan a longer time range from Cleanup."
      />
    </>
  );
}
