import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { HistoryList } from "@/components/views/HistoryList";

export const metadata: Metadata = { title: "Attempt history (demo) — Tidely" };

export default function DemoHistoryPage() {
  return (
    <>
      <PageHeader title="Unsubscribe attempts" subtitle="Every unsubscribe attempt, including the ones that did not work." />
      <HistoryList />
    </>
  );
}
