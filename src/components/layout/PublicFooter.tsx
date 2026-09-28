import Link from "next/link";
import { CodeXml } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { REPO_URL } from "@/lib/site";
import styles from "./PublicFooter.module.css";

/**
 * The public footer.
 *
 * Only links that exist are rendered. There is no invented social profile and
 * no contact address that nobody reads — see src/lib/site.ts, where anything
 * missing is simply left out rather than faked.
 */
export function PublicFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.brand}>
        <Logo />
        <p className={styles.tagline}>
          A free tool for finding and leaving mailing lists.
        </p>
      </div>

      <nav className={styles.links} aria-label="Footer">
        <Link href="/demo">Try the demo</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        {REPO_URL ? (
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            <CodeXml size={14} strokeWidth={1.75} aria-hidden /> Source
          </a>
        ) : null}
      </nav>

      <p className={styles.note}>
        Tidely reads message headers to find mailing lists. An unsubscribe
        attempt may read one message to find its unsubscribe link, and a
        mailto-only sender is unsubscribed by sending an email from your address.
        You can disconnect at any time.
      </p>
    </footer>
  );
}
