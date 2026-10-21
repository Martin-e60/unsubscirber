import { redirect } from "next/navigation";
import { clearOutRedirect } from "@/lib/navigation";

/**
 * Clear out was folded into Cleanup: selecting a sender there shows its
 * messages, and "All emails" shows the whole mailbox. Old links and bookmarks
 * land in the unified workspace with their filters, and so does the return
 * trip from Google's permission screen. No data is touched.
 */
export default async function ClearOutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(clearOutRedirect("", await searchParams));
}
