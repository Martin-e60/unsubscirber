import Link from "next/link";
import { Mails } from "lucide-react";
import theme from "./theme.module.css";
import styles from "./LandingNav.module.css";

/**
 * The landing page's navigation.
 *
 * Separate from PublicHeader on purpose: the legal and feature pages still use
 * that one, and restyling it would have changed them too. This one carries the
 * landing page's palette and nothing else.
 *
 * Only one thing here looks like a button. Sign in is a returning visitor's
 * route, not a call to action; Connect Gmail gets an outline rather than a
 * fill, so the page's single filled button — Try the demo — stays the obvious
 * first step.
 */
export function LandingNav() {
  return (
    <header className={styles.bar}>
      <div className={`${theme.container} ${styles.inner}`}>
        <Link href="/" className={styles.brand} aria-label="Tidely home">
          <span className={styles.mark} aria-hidden="true">
            <Mails size={20} strokeWidth={1.9} />
          </span>
          <span className={styles.word}>tidely.</span>
        </Link>

        <nav className={styles.nav} aria-label="Main">
          <a className={`${styles.link} ${styles.wide}`} href="#how-it-works">
            How it works
          </a>
          <Link className={`${styles.link} ${styles.wide}`} href="/demo">
            Demo
          </Link>
          <Link className={styles.link} href="/login">
            Sign in
          </Link>
          <Link className={styles.connect} href="/register">
            Connect Gmail
          </Link>
        </nav>
      </div>
    </header>
  );
}
