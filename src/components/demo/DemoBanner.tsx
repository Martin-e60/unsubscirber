"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, Info, RefreshCw, RotateCcw } from "lucide-react";
import { resetDemo } from "@/lib/demo/client";
import styles from "./DemoBanner.module.css";

/**
 * The strip that sits above the demo.
 *
 * Present on every demo screen so nobody can mistake sample data for their own
 * mailbox, and it carries the two things a visitor wants next: start over, or
 * try it on a real inbox.
 *
 * On Home it is the same strip in Home's own wording and proportions; the
 * other demo screens keep the original.
 */
export function DemoBanner() {
  const home = usePathname() === "/demo";

  if (home) {
    return (
      <div className={styles.homeBanner} role="region" aria-label="Demo mode">
        <p className={styles.homeLabel}>
          <Info className={styles.homeIcon} size={24} strokeWidth={1.75} aria-hidden />
          <span className={styles.homeText}>
            <strong>Demo</strong>
            <span className={styles.homeSample}> · Sample data only.</span>{" "}
            <span className={styles.homeDetail}>
              Changes stay in this browser; no real emails are sent.
            </span>
          </span>
        </p>

        <div className={styles.homeActions}>
          <button type="button" className={styles.homeReset} onClick={resetDemo}>
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
