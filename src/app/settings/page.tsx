import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SettingsView } from "@/components/SettingsView";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const account = await getPrimaryAccount(user.id);
  if (!account) redirect("/api/auth/google/start");

  return (
    <AppShell>
      <PageHeader title="Settings" />
      <SettingsView connectedAt={account.createdAt.toISOString()} />
    </AppShell>
  );
}
