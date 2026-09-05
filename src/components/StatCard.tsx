import type { LucideIcon } from "lucide-react";
import styles from "./StatCard.module.css";

/**
 * One headline number.
 *
 * `delta` is optional because a fresh account has no month-over-month change
 * to report yet, and inventing one would be worse than showing none.
 */

export function StatCard({
  value,
  label,
  delta,
  icon: Icon,
  tone = "primary",
}: {
  value: string;
  label: string;
  delta?: string;
  icon: LucideIcon;
  tone?: "primary" | "success" | "danger";
}) {
  return (
    <article className={styles.card}>
      <div className={styles.top}>
        <p className={styles.value}>{value}</p>
        <span className={`${styles.icon} ${styles[tone]}`}>
          <Icon size={18} strokeWidth={1.75} aria-hidden />
        </span>
      </div>

      <p className={styles.label}>{label}</p>
      {delta ? <p className={styles.delta}>↑ {delta}</p> : null}
    </article>
  );
}
