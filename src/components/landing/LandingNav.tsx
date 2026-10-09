import Link from "next/link";
import { ThemeToggle } from "./LandingTheme";
import styles from "./LandingNav.module.css";

/**
 * The landing page's navigation.
 *
 * Separate from PublicHeader on purpose: the legal and feature pages still use
 * that one, and restyling it would have changed them too. This one carries the
 * landing page's palette and nothing else.
 *
 * Three groups across the full width: the logo and the page links on the left,
 * the theme switch exactly in the middle, and the account links on the right.
 * The middle column is auto-sized between two equal ones, so the switch stays
 * on the centre line whatever the side groups' widths. Only one thing here
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
            <a className={styles.link} href="#how-it-works">
              How it works
            </a>
            <Link className={styles.link} href="/demo">
              Demo
            </Link>
          </nav>
        </div>

        <div className={styles.middle}>
          <ThemeToggle />
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
