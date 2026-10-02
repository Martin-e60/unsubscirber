/**
 * Wording for Clear out's dates, sizes and names. Pure, with the clock
 * passed in, so the list, the preview and a test agree.
 */

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Today" · "Yesterday" · "28 Sep" · "28 Sep 2024". */
export function listDate(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const dayMonth = `${date.getDate()} ${SHORT[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? dayMonth : `${dayMonth} ${date.getFullYear()}`;
}

/** "Thursday 2 October 2026 at 14:05", in the reader's own timezone. */
export function fullDate(iso: string | null): string {
  if (!iso) return "Unknown date";
  const date = new Date(iso);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${DAYS[date.getDay()]} ${date.getDate()} ${LONG[date.getMonth()]} ${date.getFullYear()} at ${time}`;
}

/** "Today at 14:05" · "28 Sep at 09:12" — for History. */
export function whenLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${listDate(iso, now)} at ${time}`;
}

/** "220 KB" · "6.4 MB". Gmail's sizes are estimates, so one decimal at most. */
export function sizeLabel(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes)) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** "About 1,248 emails" when Gmail estimates; "186 emails" when it is exact. */
export function totalLabel(total: number, exact: boolean): string {
  const noun = total === 1 ? "email" : "emails";
  if (exact) return `${total.toLocaleString("en")} ${noun}`;
  return `About ${total.toLocaleString("en")} ${noun}`;
}

/** The person's timezone, for explaining a date cutoff. */
export function timeZoneName(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}
