import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UnsubscribedView } from "@/components/unsubscribed/UnsubscribedView";
import { unconfirmedStatus } from "@/lib/navigation";

export const metadata: Metadata = { title: "Unsubscribed (demo) — Tidely" };

/** Unconfirmed outcomes live in Senders, as in the real app. */
export default async function DemoUnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const moved = unconfirmedStatus((await searchParams).status);
  if (moved) redirect(`/demo/senders?status=${moved}`);

  return <UnsubscribedView />;
}
