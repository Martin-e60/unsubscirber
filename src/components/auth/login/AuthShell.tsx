import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Mails } from "lucide-react";
// The editorial phrase in the heading.
import "@fontsource-variable/newsreader/wght-italic.css";
import theme from "@/components/layout/appTheme.module.css";
import styles from "./Login.module.css";

/**
 * The frame around signing in, and around recovering a password: the brand
 * and the way home at the top, a quiet editorial column on the left, the
 * form card on the right, and the legal links at the foot.
 *
 * On phones the editorial column is dropped so the form comes first.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={`${theme.theme} ${styles.page}`}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Tidely home">
          <span className={styles.mark} aria-hidden="true">
            <Mails size={22} strokeWidth={1.9} />
          </span>
          <span className={styles.word}>tidely.</span>
        </Link>
        <Link href="/" className={styles.back}>
          <ArrowLeft size={20} strokeWidth={1.8} aria-hidden />
          Back to home
        </Link>
      </header>

      <main className={styles.main}>
        <section className={styles.editorial} aria-label="About Tidely">
          <p className={styles.eyebrow}>A little less inbox noise</p>
          <p className={styles.headline}>
            <span className={styles.headlineFirst}>Your inbox.</span>
            <span className={styles.headlineSecond}>A little more calm.</span>
          </p>
          <p className={styles.lede}>Keep what matters. Make room for the rest.</p>
          <Settling />
        </section>

        <div className={styles.cardColumn}>
          <div className={styles.card}>{children}</div>
        </div>
      </main>

      <footer className={styles.footer}>
        <nav aria-label="Legal" className={styles.legal}>
          <Link href="/privacy">Privacy</Link>
          <span aria-hidden="true">|</span>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}

/** Envelopes settling into a tray, in cherry line on a soft pink ground. */
function Settling() {
  return (
    <svg className={styles.art} viewBox="0 0 560 360" aria-hidden="true" focusable="false">
      <ellipse cx="282" cy="186" rx="272" ry="160" fill="#F5D8DE" opacity="0.5" />
      <ellipse cx="270" cy="338" rx="200" ry="11" fill="#F5D8DE" />

      <g fill="#FFFEFC" stroke="#A32D4D" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round">
        {/* Falling, top left. */}
        <g transform="translate(118 26) rotate(-16 70 46)">
          <rect x="0" y="0" width="140" height="92" rx="5" />
          <path d="M3 6 70 54 137 6" fill="none" />
        </g>
        {/* On its way in. */}
        <g transform="translate(222 116) rotate(9 70 46)">
          <rect x="0" y="0" width="140" height="92" rx="5" />
          <path d="M3 6 70 54 137 6" fill="none" />
        </g>
        {/* The tray's back edge, behind the settled envelope. */}
        <path d="M150 256h244" fill="none" />
        {/* Settled, half inside. */}
        <g transform="translate(176 212) rotate(-9 70 46)">
          <rect x="0" y="0" width="140" height="92" rx="5" />
          <path d="M3 6 70 54 137 6" fill="none" />
        </g>
        {/* The tray: open sides and a lowered front. */}
        <path d="M150 256 128 284M394 256l22 28" fill="none" />
        <path d="M128 284h56a6 6 0 0 1 5.5 3.6l7 16.4a6 6 0 0 0 5.5 3.6h139a6 6 0 0 0 5.5-3.6l7-16.4a6 6 0 0 1 5.5-3.6h57v52a8 8 0 0 1-8 8H136a8 8 0 0 1-8-8z" />
      </g>

      {/* A little motion. */}
      <g fill="none" stroke="#A32D4D" strokeWidth="3" strokeLinecap="round">
        <path d="M100 150c-12 18-10 38 6 54" />
        <path d="M206 206l-10-20M196 222l-16-8" />
        <path d="M372 208l14-20M384 224l18-8" />
      </g>
    </svg>
  );
}
