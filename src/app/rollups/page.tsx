import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SenderWorkspace } from "@/components/senders/SenderWorkspace";
import { Notice } from "@/components/ui/Notice";
import { getCurrentUser, hasMailbox } from "@/lib/api/auth";
import { SENDER_STATUS } from "@/lib/constants";
import { loginHref } from "@/lib/auth/next";

/**
 * Rollups, retired.
 *
 * The feature marked senders for a digest email that was never built, so it is
 * gone from the navigation, the feature pages and the marketing copy. This page
 * stays for one reason: accounts that used it still have senders sitting in this
 * status, and they deserve somewhere to see them and put them back. It is
 * reachable from Settings, and only when there is something here to see.
 */

export const dynamic = "force-dynamic";

export default async function RollupsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/rollups"));
  if (!(await hasMailbox(user.id))) redirect("/connect");

  return (
    <AppShell>
      <PageHeader
        title="Rollups (retired)"
        subtitle="Senders you once marked for a digest."
      />
      <Notice tone="warning">
        Rollups never sent anything. Marking a sender collected it here and
        changed nothing about how its mail arrived, so the feature has been
        removed rather than left looking finished. These senders are untouched —
        use <strong>Undo</strong> to put one back in your list and decide on it
        properly, or leave them as they are.
      </Notice>
      <SenderWorkspace
        initialStatus={SENDER_STATUS.ROLLED_UP}
        showTabs={false}
        emptyTitle="Nothing is marked for a rollup"
        emptyDescription="Nothing to clear up here."
      />
      <p style={{ marginBlockStart: "var(--space-6)" }}>
        <Link href="/cleanup">Back to Cleanup</Link>
      </p>
    </AppShell>
  );
}
