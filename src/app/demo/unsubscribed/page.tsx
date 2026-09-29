import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UnsubscribedView } from "@/components/unsubscribed/UnsubscribedView";
import { cleanupHref, unconfirmedStatus } from "@/lib/navigation";

export const metadata: Metadata = { title: "Unsubscribed (demo) — Tidely" };

/** Unconfirmed outcomes are filters in Cleanup, as in the real app. */
export default async function DemoUnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const moved = unconfirmedStatus((await searchParams).status);
  if (moved) redirect(cleanupHref("/demo", { status: moved }));

  return <UnsubscribedView />;
}
