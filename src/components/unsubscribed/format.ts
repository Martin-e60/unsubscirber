/**
 * Dates on the Unsubscribed page: "Sep 24", with the year only when it is
 * not this year. Pure, with the clock passed in.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthDay(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const label = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? label : `${label}, ${date.getFullYear()}`;
}

/** "today, 10:42" · "yesterday, 18:05" · "Sep 24, 10:42". */
export function checkedWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / 86_400_000);
  if (diff === 0) return `today, ${time}`;
  if (diff === 1) return `yesterday, ${time}`;
  return `${monthDay(iso, now)}, ${time}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
}
