import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { HomeView } from "@/components/views/HomeView";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";

/**
 * Auth is checked on the server before anything renders, so the app is never
 * briefly visible to someone who is not signed in.
 */

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const account = await getPrimaryAccount(user.id);
  if (!account) redirect("/connect");

  return (
    <AppShell>
      <HomeView />
    </AppShell>
  );
}
