/**
 * Did a mailing list keep writing after you unsubscribed?
 *
 * Pure, and deliberately not server-only: the API and the public demo both
 * build the Unsubscribed page from these rules, and tests pin them down
 * without a database.
 *
 * What counts as "the same list":
 *   - Only mail from the exact sending address the unsubscribe was for. Other
 *     addresses at the same company or domain are different senders.
 *   - When that address was seen with a List-Id before the unsubscribe, a
 *     later message must carry one of those List-Ids. A different List-Id is
 *     another list from the same address; no List-Id at all is more likely a
 *     receipt or account notice than the newsletter.
 *   - Only mail the scan already classed as list mail is recorded at all, so
 *     plain personal and transactional mail never reaches this point.
 *
 * What counts as a check: a scan that finished. A scan that failed, was
 * stopped, or is still running proves nothing about what did not arrive.
 */

const DAY = 86_400_000;

/**
 * A check that ran within this long of the unsubscribe says almost nothing:
 * the list barely had a chance to write. It is reported as not checked yet.
 */
export const MIN_CHECK_GAP_MS = DAY;

export type ObservationState = "NEW_MAIL" | "NO_NEW_MAIL" | "NOT_CHECKED";

/** Why a sender is "not checked yet". */
export type NotCheckedReason = "NO_DATE" | "NO_CHECK" | "TOO_SOON";

export type RecordedMessage = {
  id: string;
  receivedAt: Date | null;
  listId: string | null;
  subject: string | null;
};

/** A scan that finished successfully. */
export type CompletedCheck = {
  startedAt: Date;
  finishedAt: Date;
  lookbackDays: number;
};

export type Observation = {
  state: ObservationState;
  reason: NotCheckedReason | null;
  /** Matching mail received after the unsubscribe, newest first. */
  messages: RecordedMessage[];
  /** How later mail was matched to this list. */
  matchedBy: "LIST_ID" | "ADDRESS";
  /** The latest completed check that ran after the unsubscribe. */
  check: {
    at: Date;
    /** The part of the time since unsubscribing that check actually read. */
    from: Date;
    to: Date;
    /** True when the check did not reach back to the unsubscribe. */
    partial: boolean;
    /** Matching messages inside that range. */
    found: number;
  } | null;
};

/** "Figma News <news.figma.com>" → "news.figma.com". */
export function normaliseListId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const bracketed = /<([^>]+)>/.exec(raw);
  const value = (bracketed ? bracketed[1] : raw).trim().toLowerCase();
  return value || null;
}

export function observe(input: {
  /** When the unsubscribe was confirmed. Null for old records without one. */
  unsubscribedAt: Date | null;
  /** List-Ids this address used on mail received up to the unsubscribe. */
  earlierListIds: string[];
  /** Recorded messages from this sender; any date, in any order. */
  messages: RecordedMessage[];
  /** The latest completed scan of the mailbox, if any. */
  latestCheck: CompletedCheck | null;
}): Observation {
  const known = new Set(
    input.earlierListIds.map((id) => normaliseListId(id)).filter((id): id is string => id !== null),
  );
  const matchedBy = known.size > 0 ? "LIST_ID" : "ADDRESS";
  const { unsubscribedAt, latestCheck } = input;

  if (!unsubscribedAt) {
    return { state: "NOT_CHECKED", reason: "NO_DATE", messages: [], matchedBy, check: null };
  }

  const seen = new Set<string>();
  const messages = input.messages
    .filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      // Without a received time there is no telling which side it fell on.
      if (!message.receivedAt || message.receivedAt <= unsubscribedAt) return false;
      if (known.size === 0) return true;
      const listId = normaliseListId(message.listId);
      return listId !== null && known.has(listId);
    })
    .sort((a, b) => b.receivedAt!.getTime() - a.receivedAt!.getTime());

  const check =
    latestCheck && latestCheck.startedAt > unsubscribedAt
      ? coverage(latestCheck, unsubscribedAt, messages)
      : null;

  if (messages.length > 0) {
    return { state: "NEW_MAIL", reason: null, messages, matchedBy, check };
  }

  if (!check) {
    return { state: "NOT_CHECKED", reason: "NO_CHECK", messages, matchedBy, check: null };
  }

  if (check.at.getTime() - unsubscribedAt.getTime() < MIN_CHECK_GAP_MS) {
    return { state: "NOT_CHECKED", reason: "TOO_SOON", messages, matchedBy, check };
  }

  return { state: "NO_NEW_MAIL", reason: null, messages, matchedBy, check };
}

function coverage(scan: CompletedCheck, unsubscribedAt: Date, messages: RecordedMessage[]) {
  const windowStart = new Date(scan.startedAt.getTime() - scan.lookbackDays * DAY);
  const from = windowStart > unsubscribedAt ? windowStart : unsubscribedAt;
  const to = scan.startedAt;
  return {
    at: scan.finishedAt,
    from,
    to,
    partial: windowStart > unsubscribedAt,
    found: messages.filter((m) => m.receivedAt! >= from && m.receivedAt! <= to).length,
  };
}

/**
 * How far back "Check again" should scan: far enough to reach the oldest
 * dated unsubscribe, rounded up to a period the scan controls offer, and
 * never beyond the longest of them.
 */
export function lookbackToCover(
  oldestUnsubscribe: Date | null,
  options: readonly number[],
  fallback: number,
  now: Date = new Date(),
): number {
  if (!oldestUnsubscribe) return fallback;
  const days = Math.ceil((now.getTime() - oldestUnsubscribe.getTime()) / DAY) + 1;
  const sorted = [...options].sort((a, b) => a - b);
  return sorted.find((option) => option >= days) ?? sorted[sorted.length - 1];
}
