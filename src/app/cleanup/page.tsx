import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { CleanupView } from "@/components/cleanup/CleanupView";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** ?review=<sender id> opens that sender for review — see ReviewCard. */
export default async function CleanupPage({
  searchParams,
}: {
  searchParams: Promise<{ review?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await getPrimaryAccount(user.id))) redirect("/connect");

  const { review } = await searchParams;

  return (
    <AppShell>
      <CleanupView reviewId={review ?? null} />
    </AppShell>
  );
}
