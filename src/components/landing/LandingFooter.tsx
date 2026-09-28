import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { REPO_URL } from "@/lib/site";
import theme from "./theme.module.css";
import styles from "./LandingFooter.module.css";

/** A calm, compact footer. The stack details live in the repository. */
export function LandingFooter() {
  return (
    <footer className={`${theme.container} ${styles.footer}`}>
      <div className={styles.top}>
        <div className={styles.about}>
          <p className={styles.word}>tidely.</p>
          <p>A free tool for finding and leaving mailing lists.</p>
          <p>A personal project by Martin, built in Bulgaria.</p>
        </div>

        <nav className={styles.links} aria-label="Footer">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          {REPO_URL ? (
            <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
              Source
              <ArrowUpRight size={15} strokeWidth={1.75} aria-hidden />
              <span className="srOnly"> (opens GitHub in a new tab)</span>
            </a>
          ) : null}
        </nav>
      </div>

      <div className={styles.bottom}>
        <p>A little less noise. A little more room.</p>
        <p>Free, with no paid plan.</p>
      </div>
    </footer>
  );
}
