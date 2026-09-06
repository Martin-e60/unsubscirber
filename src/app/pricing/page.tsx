import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PricingView } from "@/components/views/PricingView";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Pricing | Tidely" };

export default async function PricingPage() {
  const user = await getCurrentUser();
  const account = user ? await getPrimaryAccount(user.id) : null;

  if (account) return <AppShell><PricingView /></AppShell>;

  return (
    <div className={styles.page}>
      <div className={styles.header}><PublicHeader signedIn={Boolean(user)} /></div>
      <main><PricingView /></main>
    </div>
  );
}
