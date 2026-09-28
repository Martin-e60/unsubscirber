import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsView } from "@/components/views/SettingsView";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";
import { countByStatus } from "@/lib/api/senders";
import { SENDER_STATUS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const account = await getPrimaryAccount(user.id);
  if (!account) redirect("/connect");

  // Only shown if this account actually has senders marked from the days when
  // Rollups was in the interface, so nobody new is introduced to a dead end.
  const counts = await countByStatus(account.id);

  return (
    <AppShell>
      <PageHeader title="Settings" />
      <SettingsView
        connectedAt={account.createdAt.toISOString()}
        accountEmail={account.email}
        userEmail={user.email}
        rolledUpCount={counts[SENDER_STATUS.ROLLED_UP]}
      />
    </AppShell>
  );
}
