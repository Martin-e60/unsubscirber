/**
 * The scale behind the "Time saved / month" ruler.
 *
 * There is no fixed maximum: the ruler ends at the next round step above the
 * figure and moves to the one after it when the figure outgrows it. Steps are
 * 10 min, 30 min and 1 h, then 1–2–5 of every power of ten in hours — 2 h, 5 h,
 * 10 h, 20 h, 50 h, 100 h and on. The end is printed with `formatMinutes`, like
 * every other duration on Home, so a day is "24 h" and never a second wording.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/** Hours steps within each power of ten: 1, 2, 5, then the next power's 1. */
const HOUR_STEPS = [1, 2, 5, 10] as const;

/**
 * The seconds at which the ruler ends for a figure.
 *
 * The figure is read the way it is printed — in whole minutes — so a value that
 * reads "10 min" never sits at the end of a "10 min" ruler. Zero, and anything
 * that prints as under a minute, gets the smallest step.
 */
export function rulerEnd(seconds: number): number {
  const minutes = Math.round(Math.max(0, seconds) / MINUTE);

  if (minutes < 10) return 10 * MINUTE;
  if (minutes < 30) return 30 * MINUTE;
  if (minutes < 60) return HOUR;

  const hours = minutes / 60;
  let power = 1;
  while (power * 10 <= hours) power *= 10;

  for (const step of HOUR_STEPS) {
    if (hours < step * power) return step * power * HOUR;
  }
  return 10 * power * HOUR;
}
