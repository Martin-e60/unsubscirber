"use client";

import Link from "next/link";
import { FlaskConical, RotateCcw } from "lucide-react";
import { resetDemo } from "@/lib/demo/client";
import styles from "./DemoBanner.module.css";

/**
 * The strip that sits above the demo.
 *
 * Present on every demo screen so nobody can mistake sample data for their own
 * mailbox, and it carries the two things a visitor wants next: start over, or
 * try it on a real inbox.
 */
export function DemoBanner() {
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
