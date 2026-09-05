import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Mail } from "lucide-react";
import { getCurrentUser, getPrimaryAccount } from "@/lib/api/auth";
import { authErrorMessage } from "@/lib/auth-flow";
import { Logo } from "@/components/layout/Logo";
import { SignOutButton } from "@/components/auth/SignOutButton";
import styles from "@/components/auth/AuthPage.module.css";

export const metadata: Metadata = { title: "Connect your inbox — Tidely" };

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await getPrimaryAccount(user.id)) redirect("/dashboard");
  const error = authErrorMessage((await searchParams).error);
  return <main className={styles.connectPage}>
    <Link href="/" className={styles.logo} aria-label="Tidely home"><Logo /></Link>
    <div className={styles.connectCard}>
      <div className={styles.icon}><Mail size={27} aria-hidden /></div>
      <p className={styles.eyebrow}>Your account is ready</p>
      <h1>Let&rsquo;s connect your inbox.</h1>
      <p className={styles.description}>Signed in as <strong>{user.email}</strong>. Connect Gmail to find your mailing lists and choose what to keep.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <a className={styles.google} href="/api/auth/google/start?mode=connect">Connect Gmail <ArrowRight size={18} aria-hidden /></a>
      <p className={styles.permissions}>Google will ask you to review the permissions. Tidely scans message headers; an unsubscribe attempt may read an individual message to find its unsubscribe link. You can disconnect at any time.</p>
      <SignOutButton />
    </div>
  </main>;
}
