import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsView } from "@/components/views/SettingsView";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const account = await getPrimaryAccount(user.id);
  if (!account) redirect("/connect");

  return (
    <AppShell>
      <PageHeader title="Settings" />
      <SettingsView connectedAt={account.createdAt.toISOString()} />
    </AppShell>
  );
}
