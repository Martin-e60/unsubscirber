import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
// The serif italic used for a few short phrases in the large headings.
// Imported here rather than in the root layout, so only this page loads it.
import "@fontsource-variable/newsreader/wght-italic.css";
import { LandingNav } from "@/components/landing/LandingNav";
import { HeroPreview } from "@/components/landing/HeroPreview";
import { Reveal } from "@/components/landing/Reveal";
import { ConnectArt, FindArt, ChooseArt } from "@/components/landing/StepArt";
import { Outcomes } from "@/components/landing/Outcomes";
import { AccessDetails } from "@/components/landing/AccessDetails";
import { LandingFooter } from "@/components/landing/LandingFooter";
import theme from "@/components/landing/theme.module.css";
import { getCurrentUser } from "@/lib/api/auth";
import { authErrorMessage } from "@/lib/auth-flow";
import { SITE_DESCRIPTION } from "@/lib/site";
import styles from "./page.module.css";

/**
 * The landing page.
 *
 * Four questions, answered in order: what Tidely does (the hero), how it
 * works (three steps), how much control you keep and what you will be told
 * (choice and the four outcomes), and how to try it (the closing band).
 *
 * Everything visual is scoped to this page through the landing tokens in
 * src/components/landing/theme.module.css. The signed-in app and the other
 * public pages keep their own styles.
 *
 * A server component: the session cookie is read first, so a signed-in visitor
 * goes straight to the dashboard without a flash of this page. Only the cookie
 * is read — not the database — so the page renders even if the database is
 * unreachable.
 */

export const metadata: Metadata = {
  title: "Tidely — find your email subscriptions and unsubscribe",
  description: SITE_DESCRIPTION,
};

const STEPS = [
  {
    art: ConnectArt,
    title: "Connect your Gmail.",
    body: "Review the access Google asks you to approve. Disconnect whenever you want.",
  },
  {
    art: FindArt,
    title: "Find your subscriptions.",
    body: "Scan the last 30 days. See your mailing lists grouped by sender.",
  },
  {
    art: ChooseArt,
    title: "Keep what you love.",
    body: "Choose the senders to leave. See the outcome of every unsubscribe attempt.",
  },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");

  // Google sign-in failures land back here with ?error=… — keep showing them.
  const error = authErrorMessage((await searchParams).error);

  return (
    <div className={theme.theme}>
      <LandingNav />

      <main>
        {/* --- Hero -------------------------------------------------------- */}
        <section className={`${theme.container} ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <p className={theme.eyebrow}>A little less inbox noise</p>
            <h1 className={styles.heroTitle}>
              Your inbox.
              <br />
              Minus <span className={theme.serif}>the junk.</span>
            </h1>
            <p className={styles.heroLede}>
              Find your Gmail subscriptions. Keep the ones you love. Unsubscribe
              from the rest.
            </p>

            <div className={styles.heroAction}>
              <Link href="/demo" className={styles.primary}>
                Try the demo
                <ArrowUpRight size={20} strokeWidth={2} aria-hidden />
              </Link>
              <p className={styles.note}>Sample data. No account needed.</p>
            </div>

            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className={styles.heroVisual}>
            <HeroPreview />
          </div>
        </section>

        {/* --- How it works ------------------------------------------------ */}
        <section
          className={`${theme.container} ${styles.section}`}
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <Reveal className={styles.sectionHead}>
            <div>
              <p className={theme.eyebrow}>How it works</p>
              <h2 className={styles.sectionTitle} id="how-title">
                A few small steps.
                <br />
                <span className={theme.serif}>A little more calm.</span>
              </h2>
            </div>
            <p className={styles.sectionAside}>
              From a busy inbox to a clear list of subscriptions. You decide what
              stays.
            </p>
          </Reveal>

          <ol className={styles.steps}>
            {STEPS.map(({ art: Art, title, body }, index) => (
              <Reveal as="li" key={title} delay={index * 110} className={styles.step}>
                <Art />
                <div className={styles.stepText}>
                  <h3 className={styles.stepTitle}>
                    <span className={styles.stepNumber} aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {title}
                  </h3>
                  <p className={styles.stepBody}>{body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* --- Choice and outcomes ----------------------------------------- */}
        <section
          className={`${theme.container} ${styles.section} ${styles.choice}`}
          aria-labelledby="choice-title"
        >
          <Reveal className={styles.choiceCopy}>
            <p className={theme.eyebrow}>Your inbox. Your choice.</p>
            <h2 className={styles.sectionTitle} id="choice-title">
              You choose.
              <br />
              We keep it <span className={theme.serif}>clear.</span>
            </h2>
            <p className={styles.choiceLede}>
              Pick the subscriptions you want to leave. Tidely shows what
              happened — including requests that still need a click, or
              didn’t work.
            </p>
            <AccessDetails />
          </Reveal>

          <Reveal className={styles.outcomes} delay={120}>
            <p className={styles.outcomesLabel} id="outcomes-label">
              Four outcomes. No guessing.
            </p>
            <Outcomes />
          </Reveal>
        </section>

        {/* --- Try it ------------------------------------------------------ */}
        <section className={theme.container} aria-labelledby="try-title">
          <Reveal className={styles.band}>
            <div>
              <p className={styles.bandEyebrow}>Start with a preview</p>
              <h2 className={styles.bandTitle} id="try-title">
                Your next email could be
                <br />
                <span className={styles.bandSerif}>one you actually want.</span>
              </h2>
            </div>
            <div className={styles.bandAction}>
              <Link href="/demo" className={styles.cream}>
                Try the demo
                <ArrowUpRight size={18} strokeWidth={2} aria-hidden />
              </Link>
              <p className={styles.bandNote}>Sample data. No account needed.</p>
            </div>
          </Reveal>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
