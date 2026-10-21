"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, Info, RefreshCw, RotateCcw } from "lucide-react";
import { resetDemo } from "@/lib/demo/client";
import { usesHomeShell } from "@/lib/navigation";
import glass from "@/components/home/glass.module.css";
import styles from "./DemoBanner.module.css";

/**
 * The strip that sits above the demo.
 *
 * Present on every demo screen so nobody can mistake sample data for their own
 * mailbox, and it carries the two things a visitor wants next: start over, or
 * try it on a real inbox.
 *
 * On Home and Cleanup, which share Home's header and glass surfaces, it is
 * the same strip in Home's proportions — Home's own wording on Home, the
 * original sentence on Cleanup. The other demo screens keep the original.
 */
export function DemoBanner() {
  const pathname = usePathname();
  const home = usesHomeShell(pathname, "/demo");

  if (home) {
    const onHome = pathname === "/demo";
    return (
      <div
        className={`${styles.homeBanner} ${glass.card}`}
        data-compact={!onHome || undefined}
        role="region"
        aria-label="Demo mode"
      >
        <p className={styles.homeLabel}>
          <Info className={styles.homeIcon} size={24} strokeWidth={1.75} aria-hidden />
          <span className={styles.homeText}>
            <strong>Demo</strong>
            {onHome ? (
              <>
                <span className={styles.homeSample}> · Sample data only.</span>{" "}
                <span className={styles.homeDetail}>
                  Changes stay in this browser; no real emails are sent.
                </span>
              </>
            ) : (
              <span className={styles.homeSample}>
                {" "}
                · Sample data in your browser only. Nothing is emailed, nothing is unsubscribed for real.
              </span>
            )}
          </span>
        </p>

        <div className={styles.homeActions}>
          <button type="button" className={`${styles.homeReset} ${glass.button}`} onClick={resetDemo}>
            <RefreshCw size={22} strokeWidth={2.2} aria-hidden />
            Reset demo
          </button>
          <Link href="/register" className={styles.homeExit}>
            Use my email
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.banner} role="region" aria-label="Demo mode">
      <p className={styles.label}>
        <FlaskConical size={15} strokeWidth={1.75} aria-hidden />
        <strong>Demo</strong>
        <span className={styles.detail}>
          sample data in your browser only. Nothing is emailed, nothing is
          unsubscribed for real.
        </span>
      </p>

      <div className={styles.actions}>
        <button type="button" className={styles.reset} onClick={resetDemo}>
          <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
          Reset demo
        </button>
        <Link href="/register" className={styles.exit}>
          Use it on my Gmail
        </Link>
      </div>
    </div>
  );
}
