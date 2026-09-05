"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

/**
 * The only button in the app.
 *
 * Variants and sizes are named, not styled inline, so a redesign changes
 * Button.module.css and every button in the product follows.
 */

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?:
    | "primary"
    | "secondary"
    | "ghost"
    | "danger"
    | "softPrimary"
    | "softSuccess"
    | "softDanger";
  size?: "sm" | "md";
  loading?: boolean;
  iconLeft?: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  iconLeft,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      data-loading={loading || undefined}
      className={[styles.button, styles[variant], styles[size], className]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : iconLeft}
      <span>{children}</span>
    </button>
  );
}
