import type { Metadata } from "next";
import { CleanupView } from "@/components/cleanup/CleanupView";

export const metadata: Metadata = { title: "Cleanup (demo) — Tidely" };

export default function DemoCleanupPage() {
  return <CleanupView />;
}
