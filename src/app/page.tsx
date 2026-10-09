import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDown, ArrowRight, ChevronDown } from "lucide-react";
import { LandingNav } from "@/components/landing/LandingNav";
import { FeatureTour } from "@/components/landing/FeatureTour";
import { TourLink } from "@/components/landing/TourLink";
import { Faq } from "@/components/landing/Faq";
import { LandingFooter } from "@/components/landing/LandingFooter";
import theme from "@/components/landing/theme.module.css";
import { getCurrentUser } from "@/lib/api/auth";
import { authErrorMessage } from "@/lib/auth-flow";
import { SITE_DESCRIPTION } from "@/lib/site";
import styles from "./page.module.css";

/**
 * The landing page.
 *
 * Four parts, in order: what Tidely does (the hero), a tour of its four
 * screens, the FAQ (dark) and the footer (light).
 *
 * Everything visual is scoped to this page through the landing tokens in
 * src/components/landing/theme.module.css. The signed-in app and the other
 * public pages keep their own styles. The hero, and the header above it, sit on
 * one fixed dark paper background; the feature tour below is white, with its
 * four outer corners rounded over the dark. There is no light / dark switch.
 *
 * The footer is not part of <main>: on a wide screen it is pinned to the
 * bottom of the window behind the page and uncovered as the FAQ scrolls up
 * (see .stage in page.module.css and LandingFooter.module.css).
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

      <main className={styles.stage}>
        {/* --- Hero -------------------------------------------------------- */}
        <section className={styles.hero}>
          {/* The dark paper. It reaches up behind the transparent header, so
              the two share one surface. */}
          <div className={styles.paper} aria-hidden="true">
            <span className={styles.paperLeft} />
            <span className={styles.paperRight} />
          </div>

          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <h1 className={styles.heroTitle}>
                Unsubscribe from
                <br />
                unwanted emails.
              </h1>
              <p className={styles.heroLede}>
                Find your Gmail mailing lists and choose which ones to leave.
              </p>

              <div className={styles.actions}>
                <Link href="/demo" className={styles.primary}>
                  Open demo
                  <ArrowRight size={22} strokeWidth={2} aria-hidden />
                </Link>
                <TourLink href="#tour" className={styles.secondary}>
                  Take a tour
                  <ArrowDown size={22} strokeWidth={2} aria-hidden />
                </TourLink>
                <p className={styles.note}>Sample data. No account needed.</p>
              </div>

              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </div>

          <div className={styles.heroFoot} aria-hidden="true">
            <ChevronDown size={20} strokeWidth={2.7} />
          </div>
        </section>

        {/* --- Feature tour ------------------------------------------------ */}
        <div className={styles.tourFrame}>
          <FeatureTour />
        </div>

        {/* --- FAQ --------------------------------------------------------- */}
        <Faq />
      </main>

      <LandingFooter />
    </div>
  );
}
