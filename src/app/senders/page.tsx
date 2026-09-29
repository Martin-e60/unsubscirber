import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SenderWorkspace } from "@/components/senders/SenderWorkspace";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";
import { senderFilter } from "@/lib/navigation";

/**
 * Every sender we have ever seen, whatever its status. ?status= opens one
 * tab directly — Requests sent, Needs a click and Failed are reached that way.
 */

export const dynamic = "force-dynamic";

export default async function SendersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await getPrimaryAccount(user.id))) redirect("/connect");

  const { search, status } = await searchParams;

  return (
    <AppShell>
      <PageHeader title="Senders" subtitle="Everyone who has emailed you a list." />
      <SenderWorkspace
        key={senderFilter(status)}
        initialStatus={senderFilter(status)}
        initialSearch={search ?? ""}
        emptyTitle="No senders match"
        emptyDescription="Try a different search, or scan a longer time range from Cleanup."
      />
    </AppShell>
  );
}
