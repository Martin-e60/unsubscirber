import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { HistoryList } from "@/components/views/HistoryList";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/**
 * Every unsubscribe attempt — successes, sent requests, failures and ones
 * that needed a click. The Unsubscribed page keeps only confirmed
 * unsubscribes, and links here for the full record.
 */
export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await getPrimaryAccount(user.id))) redirect("/connect");

  return (
    <AppShell>
      <PageHeader title="Unsubscribe attempts" subtitle="Every unsubscribe attempt, including the ones that did not work." />
      <HistoryList />
    </AppShell>
  );
}
