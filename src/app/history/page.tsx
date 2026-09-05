import { redirect } from "next/navigation";

/**
 * The history screen moved onto the Unsubscribed page in the Tidely redesign.
 * This redirect keeps any old links and bookmarks working.
 */
export default function HistoryPage() {
  redirect("/unsubscribed");
}
