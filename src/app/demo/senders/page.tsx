import { redirect } from "next/navigation";
import { sendersRedirect } from "@/lib/navigation";

/** As in the real app: Senders now lives in Cleanup. */
export default async function DemoSendersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  redirect(sendersRedirect("/demo", await searchParams));
}
