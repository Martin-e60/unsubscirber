import type { Metadata } from "next";
import { HomeView } from "@/components/views/HomeView";

export const metadata: Metadata = {
  title: "Try the demo — Tidely",
  description:
    "The real Tidely interface filled with sample data. No account, no Google sign-in, no access to your mailbox.",
};

export default function DemoHomePage() {
  return <HomeView />;
}
