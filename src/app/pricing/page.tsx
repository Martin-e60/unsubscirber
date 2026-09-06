import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Logo } from "@/components/layout/Logo";
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
      <header className={styles.header}>
        <Link href="/" className={styles.logo} aria-label="Tidely home"><Logo /></Link>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/">Home</Link>
          <Link href={user ? "/connect" : "/login"}>
            {user ? "Connect inbox" : "Sign in"}
          </Link>
        </nav>
      </header>
      <main><PricingView /></main>
    </div>
  );
}
