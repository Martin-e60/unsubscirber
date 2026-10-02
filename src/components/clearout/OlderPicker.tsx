"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import {
  OLDER_PRESETS,
  cutoffFor,
  describeCutoff,
  isCutoffDate,
  isoDay,
  longDate,
} from "@/lib/clearout/filters";
import { timeZoneName } from "./format";
import { menuKeys } from "./Popover";
import styles from "./Pickers.module.css";

/**
 * "Older than…": three common cutoffs or a date of your own, and a plain
 * sentence saying exactly which mail that means in your timezone.
 */
export function OlderPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const custom = value !== null && isCutoffDate(value);
  const [date, setDate] = useState(custom ? value : "");
  const today = isoDay(new Date());
  const zone = timeZoneName();
  const description = describeCutoff(value);
  const draftCutoff = isCutoffDate(date) && date <= today ? cutoffFor(date) : null;

  return (
    <div className={styles.picker}>
      <div role="menu" aria-label="Older than" onKeyDown={menuKeys} className={styles.menuList}>
        {OLDER_PRESETS.map((preset) => {
          const on = value === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              role="menuitemradio"
              aria-checked={on}
              className={styles.option}
              data-on={on || undefined}
              onClick={() => onChange(preset.value)}
            >
              <span className={styles.optionMark} aria-hidden="true">
                {on ? <Check size={15} strokeWidth={2.4} /> : null}
              </span>
              <span className={styles.optionText}>
                <span className={styles.optionName}>{preset.label}</span>
                <span className={styles.optionAddress}>Before {longDate(cutoffFor(preset.value)!)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <form
        className={styles.custom}
        onSubmit={(event) => {
          event.preventDefault();
          if (draftCutoff) onChange(date);
        }}
      >
        <label className={styles.customLabel} htmlFor="clear-out-cutoff">
          Or before a date
        </label>
        <div className={styles.customRow}>
          <input
            id="clear-out-cutoff"
            type="date"
            className={styles.date}
            max={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <button type="submit" className={styles.apply} disabled={!draftCutoff || date === value}>
            Apply
          </button>
        </div>
      </form>

      <p className={styles.explain} aria-live="polite">
        {description ?? "Choose how old an email must be to show."}
        {description && zone ? ` (${zone})` : ""}
      </p>

      {value ? (
        <div className={styles.pickerFoot}>
          <span />
          <button type="button" className={styles.reset} onClick={() => onChange(null)}>
            Any date
          </button>
        </div>
      ) : null}
    </div>
  );
}
