import Link from "next/link";
import styles from "./LandingNav.module.css";

/**
 * The landing page's navigation.
 *
 * Separate from PublicHeader on purpose: the legal and feature pages still use
 * that one, and restyling it would have changed them too. This one carries the
 * landing page's palette and nothing else.
 *
 * Two groups across the full width, over the dark hero: the logo and the FAQ
 * label on the left, the account links on the right. FAQ is a plain label for
 * now: the FAQ section does not exist yet, so there is nothing to link to. It
 * becomes an in-page anchor when that section is added. Only one thing here
 * looks like a button: Connect Gmail, outlined rather than filled, so Open
 * demo stays the obvious first step.
 */
export function LandingNav() {
  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <div className={styles.start}>
          <Link href="/" className={styles.brand} aria-label="Tidely home">
            <span className={styles.word}>tidely.</span>
          </Link>

          <nav className={`${styles.group} ${styles.wide}`} aria-label="Main">
            <span className={styles.label}>FAQ</span>
          </nav>
        </div>

        <nav className={`${styles.group} ${styles.end}`} aria-label="Account">
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
