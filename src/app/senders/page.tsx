import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SenderWorkspace } from "@/components/SenderWorkspace";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";

/** Every sender we have ever seen, whatever its status. */

export const dynamic = "force-dynamic";

export default async function SendersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!(await getPrimaryAccount(user.id))) redirect("/api/auth/google/start");

  const { search } = await searchParams;

  return (
    <AppShell>
      <PageHeader title="Senders" subtitle="Everyone who has emailed you a list." />
      <SenderWorkspace
        initialStatus="ALL"
        initialSearch={search ?? ""}
        emptyTitle="No senders match"
        emptyDescription="Try a different search, or scan a longer time range from Cleanup."
      />
    </AppShell>
  );
}
