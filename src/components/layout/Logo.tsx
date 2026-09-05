import styles from "./Logo.module.css";

/**
 * The wordmark: "Tidely" in text colour, with the full stop in brand purple.
 *
 * `mark` renders the square app-icon version used in tight spaces.
 */
export function Logo({ variant = "wordmark" }: { variant?: "wordmark" | "mark" }) {
  if (variant === "mark") {
    return (
      <span className={styles.mark} aria-label="Tidely">
        T<span className={styles.markDot}>.</span>
      </span>
    );
  }

  return (
    <span className={styles.wordmark}>
      Tidely<span className={styles.dot}>.</span>
    </span>
  );
}
