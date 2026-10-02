import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ClearOutView } from "@/components/clearout/ClearOutView";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Clear out — Tidely" };

/**
 * Clear out: find, organise and clear mail already in the mailbox. Filters
 * live in the URL (?from=…&older=6m&unread=1) and are read on the client.
 */
export default async function ClearOutPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await getPrimaryAccount(user.id))) redirect("/connect");

  return (
    <AppShell>
      <Suspense>
        <ClearOutView />
      </Suspense>
    </AppShell>
  );
}
