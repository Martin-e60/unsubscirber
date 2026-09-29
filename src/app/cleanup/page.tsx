import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { CleanupView } from "@/components/cleanup/CleanupView";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export default async function CleanupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await getPrimaryAccount(user.id))) redirect("/connect");

  return (
    <AppShell>
      <CleanupView />
    </AppShell>
  );
}
