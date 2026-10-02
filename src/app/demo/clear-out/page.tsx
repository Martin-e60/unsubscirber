import { Suspense } from "react";
import type { Metadata } from "next";
import { ClearOutView } from "@/components/clearout/ClearOutView";

export const metadata: Metadata = { title: "Clear out (demo) — Tidely" };

export default function DemoClearOutPage() {
  return (
    <Suspense>
      <ClearOutView />
    </Suspense>
  );
}
