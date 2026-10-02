"use client";

import { Check } from "lucide-react";
import { SIZE_OPTIONS, type ClearOutFilter, type SizeOption } from "@/lib/clearout/filters";
import { menuKeys } from "./Popover";
import styles from "./Pickers.module.css";

/**
 * The less common filters: message size, and mail from lists you have
 * unsubscribed from.
 */
export function MoreFilters({
  filter,
  onChange,
}: {
  filter: ClearOutFilter;
  onChange: (next: Partial<ClearOutFilter>) => void;
}) {
  const sizes: (SizeOption | null)[] = [null, ...SIZE_OPTIONS];

  return (
    <div className={styles.picker}>
      <p className={styles.groupLabel} id="clear-out-size-label">
        Size
      </p>
      <div role="menu" aria-labelledby="clear-out-size-label" className={styles.menuList} onKeyDown={menuKeys}>
        {sizes.map((size) => {
          const on = filter.larger === size;
          return (
            <button
              key={size ?? "any"}
              type="button"
              role="menuitemradio"
              aria-checked={on}
              className={styles.option}
              data-on={on || undefined}
              onClick={() => onChange({ larger: size })}
            >
              <span className={styles.optionMark} aria-hidden="true">
                {on ? <Check size={15} strokeWidth={2.4} /> : null}
              </span>
              <span className={styles.optionText}>
                <span className={styles.optionName}>{size ? `Larger than ${size} MB` : "Any size"}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.divider} />

      <button
        type="button"
        role="switch"
        aria-checked={filter.unsubscribed}
        className={styles.switchRow}
        onClick={() => onChange({ unsubscribed: !filter.unsubscribed })}
      >
        <span className={styles.optionText}>
          <span className={styles.optionName}>From unsubscribed lists</span>
          <span className={styles.optionAddress}>
            Mail from lists you left in Cleanup, matched by each list’s exact address and list ID — not
            everything from the same company.
          </span>
        </span>
        <span className={styles.switch} data-on={filter.unsubscribed || undefined} aria-hidden="true" />
      </button>
    </div>
  );
}
