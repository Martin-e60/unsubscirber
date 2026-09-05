"use client";

import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./Select.module.css";

/**
 * A styled dropdown.
 *
 * A native <select> under the hood — it keeps the platform's keyboard
 * behaviour and mobile picker — with the browser's default arrow replaced so
 * it matches the rest of the controls.
 */

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hideLabel?: boolean;
};

export function Select({ label, hideLabel = true, id, className, ...rest }: SelectProps) {
  return (
    <span className={[styles.wrapper, className].filter(Boolean).join(" ")}>
      <label className={hideLabel ? "srOnly" : styles.label} htmlFor={id}>
        {label}
      </label>
      <select {...rest} id={id} className={styles.select} />
      <ChevronDown className={styles.chevron} size={16} strokeWidth={1.75} aria-hidden />
    </span>
  );
}
