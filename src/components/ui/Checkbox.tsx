"use client";

import type { InputHTMLAttributes } from "react";
import styles from "./Checkbox.module.css";

export type CheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> & {
  label: string;
  /** Renders the label for screen readers only. */
  hideLabel?: boolean;
  indeterminate?: boolean;
};

export function Checkbox({
  label,
  hideLabel = false,
  indeterminate = false,
  className,
  ...rest
}: CheckboxProps) {
  return (
    <label className={[styles.wrapper, className].filter(Boolean).join(" ")}>
      <input
        {...rest}
        type="checkbox"
        className={styles.input}
        ref={(node) => {
          if (node) node.indeterminate = indeterminate;
        }}
      />
      <span className={hideLabel ? "srOnly" : styles.label}>{label}</span>
    </label>
  );
}
