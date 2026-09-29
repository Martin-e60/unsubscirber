/**
 * Values derived from a sender's raw counts.
 *
 * Pure, and deliberately not server-only: the API layer and the public demo
 * both need the same figure, and two implementations would drift.
 */

/**
 * How often this sender writes, per month.
 *
 * Measured over the span we have actually seen rather than a fixed window, so
 * a sender first seen three weeks ago is not reported as if it had been quiet
 * for a year. Anything shorter than a month counts as one month.
 */
export function emailsPerMonth(sender: SeenSpan): number {
  return Math.max(1, Math.round(monthlyRate(sender)));
}

export type SeenSpan = {
  messageCount: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
};

/**
 * The same rate, unrounded — for summing across senders, where rounding each
 * one first would inflate the total.
 *
 * Normalised to the period the data actually covers: the span between the
 * first and last message seen, never less than one month. A sender seen only
 * once therefore counts as one email a month, and one with no dates at all is
 * treated as if everything arrived within a single month.
 */
export function monthlyRate(sender: SeenSpan): number {
  const first = sender.firstSeenAt?.getTime();
  const last = sender.lastSeenAt?.getTime();
  if (!first || !last) return sender.messageCount;

  const months = Math.max(1, (last - first) / (30 * 86_400_000));
  return sender.messageCount / months;
}
