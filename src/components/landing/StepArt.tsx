import { ArrowRight, ArrowUpRight, Check, Mail } from "lucide-react";
import styles from "./StepArt.module.css";

/**
 * The three small illustrations in How it works.
 *
 * Pure decoration — each one repeats what its step's text already says — so
 * they are hidden from assistive technology.
 *
 * Their motion is tied to the <Reveal> around each step: while it is
 * "pending" they sit in a starting pose, and when it turns "in" they settle
 * into place once. The settled pose is the default, so without JavaScript or
 * with reduced motion they simply appear finished.
 */

export function ConnectArt() {
  return (
    <div className={`${styles.tile} ${styles.pink}`} aria-hidden="true">
      <div className={styles.connect}>
        <span className={styles.mailBox}>
          <Mail size={22} strokeWidth={1.75} />
        </span>
        <ArrowRight className={styles.arrow} size={18} strokeWidth={1.75} />
        <span className={styles.brandBox}>t.</span>
      </div>
    </div>
  );
}

export function FindArt() {
  return (
    <div className={`${styles.tile} ${styles.muted}`} aria-hidden="true">
      <div className={styles.stack}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={styles.bar} data-bar={i}>
            <span className={styles.dot} />
            <span className={styles.line} />
          </span>
        ))}
      </div>
    </div>
  );
}

export function ChooseArt() {
  return (
    <div className={`${styles.tile} ${styles.muted}`} aria-hidden="true">
      <div className={styles.card}>
        <span className={styles.cardRow}>
          <span>Stories</span>
          <span className={styles.status} data-status="keep">
            Keep <Check size={13} strokeWidth={2.25} />
          </span>
        </span>
        <span className={styles.cardRow}>
          <span>Deals</span>
          <span className={styles.status} data-status="leave">
            Leave <ArrowUpRight size={13} strokeWidth={2} />
          </span>
        </span>
      </div>
    </div>
  );
}
