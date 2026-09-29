import type { Metadata } from "next";
import { CleanupView } from "@/components/cleanup/CleanupView";

export const metadata: Metadata = { title: "Cleanup (demo) — Tidely" };

export default async function DemoCleanupPage({
  searchParams,
}: {
  searchParams: Promise<{ review?: string }>;
}) {
  const { review } = await searchParams;
  return <CleanupView reviewId={review ?? null} />;
}
