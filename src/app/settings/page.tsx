import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsView } from "@/components/views/SettingsView";
import { getCurrentUser } from "@/lib/api/auth";
import { loginHref } from "@/lib/auth/next";

export const dynamic = "force-dynamic";

/**
 * Settings: the connected mailboxes, what Tidely reads, and deleting the
 * Tidely profile.
 *
 * Open even with no mailbox connected, so someone who removed their last
 * mailbox can still connect another or delete their account. Everything that
 * belongs to one mailbox is loaded in the browser for the mailbox selected
 * in that tab.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/settings"));

  return (
    <AppShell>
      <PageHeader title="Settings" />
      <SettingsView userEmail={user.email} />
    </AppShell>
  );
}
