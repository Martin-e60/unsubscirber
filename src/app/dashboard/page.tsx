import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { HomeView } from "@/components/views/HomeView";
import { getCurrentUser } from "@/lib/api/auth";

/**
 * Home.
 *
 * Sign-in is checked on the server before anything renders, so the app is
 * never briefly visible to someone who is not signed in.
 *
 * A signed-in account without Gmail is shown Home too, rather than being sent
 * away: Home explains what connecting involves and links to /connect, which
 * spells out every permission before Google is involved. The other app pages
 * still require a connected mailbox.
 */

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell>
      <HomeView />
    </AppShell>
  );
}
