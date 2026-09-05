import { redirect } from "next/navigation";
import { ArrowRight, Play, Check } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getCurrentUser } from "@/lib/api/auth";
import styles from "./page.module.css";

/**
 * The sign-in screen.
 *
 * A server component: it checks the session before rendering, so a signed-in
 * user never sees a flash of the landing page before being redirected.
 *
 * The only thing this page must keep, however it is restyled, is the link to
 * /api/auth/google/start — that is what begins the Google login.
 */

const PROMISES = [
  "Connect your inbox",
  "Get smart suggestions",
  "Take back your time",
];

const STEPS = [
  {
    title: "Connect your inbox",
    body: "Sign in with Google. Tidely reads message headers only — never the contents of your email.",
  },
  {
    title: "See who's really writing",
    body: "Every newsletter and mailing list, grouped by sender, with how often each one arrives.",
  },
  {
    title: "Keep, roll up, or leave",
    body: "Unsubscribe in bulk. Tidely uses the sender's own unsubscribe link and tells you honestly when one needs a click.",
  },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const { error } = await searchParams;

  // Rendered on the server, so in a production build this branch never even
  // reaches the browser.
  const showDevSignIn = process.env.NODE_ENV !== "production";

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Logo />
        <a className={styles.navLink} href="/api/auth/google/start">
          Sign in
        </a>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Less noise. A brighter you.</p>
            <h1 className={styles.title}>
              A tidier inbox,
              <br />
              effortlessly.
            </h1>
            <p className={styles.lede}>
              Find, organize and remove the emails you don&rsquo;t need — so you
              can focus on what matters.
            </p>

            {error ? <p className={styles.error}>{error}</p> : null}

            <div className={styles.actions}>
              <a className={styles.cta} href="/api/auth/google/start">
                Get Started Free
                <ArrowRight size={18} strokeWidth={2} aria-hidden />
              </a>
              <a className={styles.secondary} href="#how-it-works">
                <span className={styles.playIcon}>
                  <Play size={12} strokeWidth={2} fill="currentColor" aria-hidden />
                </span>
                See how it works
              </a>
            </div>

            {showDevSignIn ? (
              <p className={styles.devSignIn}>
                <a href="/api/auth/dev">Skip sign-in and use demo data</a>
                <span> — development only, no Google account needed.</span>
              </p>
            ) : null}

            <ul className={styles.promises}>
              {PROMISES.map((promise) => (
                <li key={promise}>
                  <Check size={14} strokeWidth={2.5} aria-hidden />
                  {promise}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.preview} aria-hidden="true">
            <div className={styles.previewCard}>
              <div className={styles.previewHeader}>
                <span className={styles.previewTitle}>Quick cleanup</span>
                <span className={styles.previewCount}>8 senders</span>
              </div>

              {[
                { name: "AliExpress", rate: "31 / month", tint: styles.tintCoral },
                { name: "LinkedIn", rate: "24 / month", tint: styles.tintPurple },
                { name: "Notion", rate: "12 / month", tint: styles.tintMint },
              ].map((row) => (
                <div key={row.name} className={styles.previewRow}>
                  <span className={`${styles.previewAvatar} ${row.tint}`}>
                    {row.name[0]}
                  </span>
                  <span className={styles.previewName}>
                    {row.name}
                    <span className={styles.previewRate}>{row.rate}</span>
                  </span>
                  <span className={styles.pillKeep}>Keep</span>
                  <span className={styles.pillRoll}>Roll up</span>
                  <span className={styles.pillUnsub}>Unsubscribe</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.steps} id="how-it-works">
          {STEPS.map((step, index) => (
            <article key={step.title} className={styles.step}>
              <span className={styles.stepNumber}>{index + 1}</span>
              <h2 className={styles.stepTitle}>{step.title}</h2>
              <p className={styles.stepBody}>{step.body}</p>
            </article>
          ))}
        </section>

        <section className={styles.banner}>
          <p className={styles.bannerTitle}>
            A cleaner inbox
            <br />
            for a brighter you.
          </p>
          <a className={styles.bannerCta} href="/api/auth/google/start">
            Get Started Free
            <ArrowRight size={18} strokeWidth={2} aria-hidden />
          </a>
        </section>
      </main>

      <footer className={styles.footer}>
        <Logo />
        <p className={styles.footerNote}>
          Tidely reads message headers to work out who is emailing you. It never
          reads the contents of your messages, and you can disconnect at any time.
        </p>
      </footer>
    </div>
  );
}
