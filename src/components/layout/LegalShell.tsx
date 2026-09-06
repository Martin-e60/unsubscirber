import type { ReactNode } from "react";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { getCurrentUser } from "@/lib/api/auth";
import styles from "./LegalShell.module.css";

/**
 * Shared frame for the legal pages (privacy policy, terms of service).
 * Public header on top, a single readable column of prose underneath.
 */
export async function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className={styles.page}>
      <PublicHeader signedIn={Boolean(user)} />
      <main className={styles.main}>
        <header className={styles.masthead}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.updated}>Last updated {updated}</p>
        </header>
        <article className={styles.prose}>{children}</article>
      </main>
    </div>
  );
}
