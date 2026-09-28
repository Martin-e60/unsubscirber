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
export function emailsPerMonth(sender: {
  messageCount: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
}): number {
  const first = sender.firstSeenAt?.getTime();
  const last = sender.lastSeenAt?.getTime();
  if (!first || !last) return sender.messageCount;

  const months = Math.max(1, (last - first) / (30 * 86_400_000));
  return Math.max(1, Math.round(sender.messageCount / months));
}
