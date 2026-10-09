import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { REPO_URL, SOCIAL_LINKS } from "@/lib/site";
import { TourLink } from "./TourLink";
import styles from "./LandingFooter.module.css";

/**
 * The landing page's footer: a closing line and a Connect Gmail button, then
 * the logo, two short columns of links and the author's profiles.
 *
 * Light, on the dark page above it. On a wide screen it is pinned to the
 * bottom of the window behind the page and uncovered as the FAQ scrolls away
 * (see the stage in page.module.css); below that it is an ordinary footer.
 *
 * The three profile icons are monochrome and open in a new tab. They are not
 * the Source link, which points at the repository.
 */

type Social = { name: string; href: string; icon: ReactNode };

const SOCIALS: Social[] = [
  {
    name: "LinkedIn",
    href: SOCIAL_LINKS.linkedin,
    icon: (
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    ),
  },
  {
    name: "GitHub",
    href: SOCIAL_LINKS.github,
    icon: (
      <path
        transform="scale(1.5)"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    ),
  },
  {
    name: "Instagram",
    href: SOCIAL_LINKS.instagram,
    icon: (
      <>
        <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="12" cy="12" r="4.4" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="17.4" cy="6.6" r="1.3" />
      </>
    ),
  },
];

export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <h2 className={styles.headline}>
          A little less noise.
          <br />
          A little more room.
        </h2>

        <Link href="/register" className={styles.connect}>
          Connect Gmail
          <ArrowRight aria-hidden strokeWidth={1.6} />
        </Link>

        <div className={styles.row}>
          <div className={styles.about}>
            <p className={styles.word}>tidely.</p>
            <p className={styles.blurb}>
              A free tool for finding
              <br />
              and leaving mailing lists.
            </p>
          </div>

          <nav className={styles.columns} aria-label="Footer">
            <div>
              <h3 className={styles.label}>Explore</h3>
              <ul className={styles.links}>
                <li>
                  <Link href="/demo">Demo</Link>
                </li>
                <li>
                  <TourLink href="#faq">FAQ</TourLink>
                </li>
                <li>
                  <Link href="/register">Connect Gmail</Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className={styles.label}>Resources</h3>
              <ul className={styles.links}>
                <li>
                  <Link href="/privacy">Privacy</Link>
                </li>
                <li>
                  <Link href="/terms">Terms</Link>
                </li>
                {REPO_URL ? (
                  <li>
                    <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
                      Source
                      <span className="srOnly"> (opens GitHub in a new tab)</span>
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          </nav>
        </div>

        <ul className={styles.social} aria-label="Profiles">
          {SOCIALS.map(({ name, href, icon }) => (
            <li key={name}>
              <a href={href} target="_blank" rel="noreferrer noopener">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  {icon}
                </svg>
                <span className="srOnly">{name} (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
