import type { ReactNode } from "react";
import styles from "./EmptyPanel.module.css";

/** A calm message where a list would be: what happened, and one way forward. */
export function EmptyPanel({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.body}>{body}</p>
      {children ? <div className={styles.action}>{children}</div> : null}
    </div>
  );
}
