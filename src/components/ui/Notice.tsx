import type { ReactNode } from "react";
import { Info, TriangleAlert, CircleCheck } from "lucide-react";
import styles from "./Notice.module.css";

/** An inline message: context, a caveat, or a confirmation. */

const ICONS = {
  info: Info,
  warning: TriangleAlert,
  success: CircleCheck,
} as const;

export function Notice({
  tone = "info",
  children,
}: {
  tone?: keyof typeof ICONS;
  children: ReactNode;
}) {
  const Icon = ICONS[tone];

  return (
    <div className={`${styles.notice} ${styles[tone]}`}>
      <Icon size={18} strokeWidth={1.75} className={styles.icon} aria-hidden />
      <p>{children}</p>
    </div>
  );
}
