/**
 * Wording for Cleanup's dates.
 *
 * Pure, with the clock passed in, so "yesterday" means the same thing in the
 * list, the details panel and a test.
 */

const DAY = 86_400_000;

// Spelled out rather than left to Intl, whose short months vary by runtime
// ("Sep" in one, "Sept" in another).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Today" · "Yesterday" · "4 days ago" · "12 Sep" · "12 Sep 2024". */
export function receivedLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "Unknown";

  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const dayMonth = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? dayMonth : `${dayMonth} ${date.getFullYear()}`;
}

/** "Nov 2025" — when a sender was first seen, for the average's footnote. */
export function monthYear(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
