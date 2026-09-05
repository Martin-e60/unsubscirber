import styles from "./ProgressBar.module.css";

export function ProgressBar({
  value,
  label,
}: {
  /** 0 to 1. */
  value: number;
  label: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={styles.fill} style={{ inlineSize: `${percent}%` }} />
    </div>
  );
}
