import { redirect } from "next/navigation";
import { sendersRedirect } from "@/lib/navigation";

/**
 * The Senders page was folded into Cleanup: kept senders are its Keeping
 * view, and unconfirmed outcomes are filters inside To review. Old links and
 * bookmarks land in the right place, search included. No data is touched.
 */
export default async function SendersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  redirect(sendersRedirect("", await searchParams));
}
