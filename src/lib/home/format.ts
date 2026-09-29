/**
 * Wording for the Home screen's times, periods and estimates.
 *
 * Pure functions with the clock passed in, so every rule here is testable and
 * the screen never disagrees with itself about what "yesterday" means.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The lookback a scan used, in the words the scan controls use. */
export function periodLabel(days: number): string {
  switch (days) {
    case 30:
      return "Last 30 days";
    case 90:
      return "Last 3 months";
    case 180:
      return "Last 6 months";
    case 365:
      return "Last year";
    case 1095:
      return "Last 3 years";
    default:
      return `Last ${days} days`;
  }
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(date: Date, now: Date): boolean {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return sameDay(date, yesterday);
}

function clock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function shortDate(date: Date, now: Date): string {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** "Today, 10:42" · "Yesterday, 18:05" · "12 Sep, 09:30". */
export function scanWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (sameDay(date, now)) return `Today, ${clock(date)}`;
  if (isYesterday(date, now)) return `Yesterday, ${clock(date)}`;
  return `${shortDate(date, now)}, ${clock(date)}`;
}

/** "Just now" · "12 min ago" · "3 h ago" · "Yesterday" · "12 Sep". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const elapsed = now.getTime() - date.getTime();

  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (sameDay(date, now)) return `${Math.floor(elapsed / HOUR)} h ago`;
  if (isYesterday(date, now)) return "Yesterday";
  return shortDate(date, now);
}

/** An estimated count: "<1" when it rounds to nothing but is not nothing. */
export function formatEstimate(value: number): string {
  if (value > 0 && value < 0.5) return "<1";
  return Math.round(value).toLocaleString("en");
}

/** Seconds as a short duration: "<1 min", "15 min", "1 h 20 min", "2 h". */
export function formatMinutes(seconds: number): string {
  if (seconds > 0 && seconds < 30) return "<1 min";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
