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

/**
 * The one screen between signing up and a scan.
 *
 * Google's own consent screen names the permissions but not what they are for,
 * so they are spelled out here first — before the redirect, while the person can
 * still change their mind at no cost.
 */

const PERMISSIONS = [
  {
    title: "Read your Gmail",
    body: "A scan reads message headers — who sent it, when, and how that sender says to unsubscribe. It does not open your messages. The exception: if a sender publishes no unsubscribe header, leaving that list means finding the link inside one of its messages, so that one message is read when you ask to unsubscribe.",
  },
  {
    title: "Send email as you",
    body: "Some senders only accept an unsubscribe by email. For those, and only those, Tidely sends one message from your address asking to be removed. Nothing else is ever sent.",
  },
  {
    title: "Your email address and name",
    body: "So the app can show which mailbox is connected.",
  },
];

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await getPrimaryAccount(user.id)) redirect("/dashboard");

  const error = authErrorMessage((await searchParams).error);

  return (
    <main className={styles.connectPage}>
      <Link href="/" className={styles.logo} aria-label="Tidely home">
        <Logo />
      </Link>

      <div className={styles.connectCard}>
        <div className={styles.icon}>
          <Mail size={27} aria-hidden />
        </div>
        <p className={styles.eyebrow}>One step left</p>
        <h1>Connect Gmail to find your mailing lists.</h1>
        <p className={styles.description}>
          Signed in as <strong>{user.email}</strong>. Next, Google will ask you to
          approve the permissions below. Here is what each one is actually for.
        </p>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <ul className={styles.permissionList}>
          {PERMISSIONS.map((permission) => (
            <li key={permission.title}>
              <strong>{permission.title}</strong>
              <span>{permission.body}</span>
            </li>
          ))}
        </ul>

        <a className={styles.google} href="/api/auth/google/start?mode=connect">
          Continue to Google <ArrowRight size={18} aria-hidden />
        </a>

        <p className={styles.permissions}>
          After connecting, the first scan looks back 30 days — you can widen that
          or stop it at any time. You can disconnect the mailbox, or delete your
          account entirely, from Settings.{" "}
          <Link href="/privacy">How your data is handled</Link>.
        </p>

        <p className={styles.permissions}>
          Not ready? <Link href="/demo">Look around the demo first</Link> — sample
          data, no mailbox involved.
        </p>

        <SignOutButton />
      </div>
    </main>
  );
}
