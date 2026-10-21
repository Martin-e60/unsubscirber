import { redirect } from "next/navigation";
import { clearOutRedirect } from "@/lib/navigation";

/** As in the real app: Clear out now lives in Cleanup. */
export default async function DemoClearOutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(clearOutRedirect("/demo", await searchParams));
}
