import { ATTEMPT_STATUS, SCAN_STATUS } from "@/lib/constants";
import type { HistoryItemDto, ScanProgressDto } from "@/lib/api/types";
import { periodLabel } from "@/lib/home/format";

/**
 * The Home screen's "Recent activity", built only from what really happened.
 *
 * Three kinds of event, each from a real record:
 *   scan     — the most recent scan, once it finished (the scans table)
 *   removed  — confirmed unsubscribes (attempts with status SUCCESS)
 *   sent     — email requests sent, not confirmed (attempts with status SENT)
 *
 * Attempts of the same kind on the same local day are grouped, so ten
 * unsubscribes in one sitting read as one line rather than ten. A request sent
 * is never folded into a removal: they are different claims.
 *
 * Needs-a-click and failed attempts are left out on purpose — they are what
 * "Needs your attention" is for.
 */

export type ActivityKind = "scan" | "removed" | "sent";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  /** ISO timestamp of the newest event in the item. */
  at: string;
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The local calendar day, so grouping matches what the viewer calls "a day". */
function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function buildActivity({
  history,
  scan,
  limit = 3,
}: {
  history: HistoryItemDto[];
  scan: ScanProgressDto | null;
  limit?: number;
}): ActivityItem[] {
  const items: ActivityItem[] = [];

  if (scan && scan.status === SCAN_STATUS.DONE && scan.finishedAt) {
    items.push({
      id: `scan-${scan.scanId}`,
      kind: "scan",
      title: "Scan completed",
      detail: `${plural(scan.foundSenders, "sender", "senders")} found · ${periodLabel(
        scan.lookbackDays,
      ).toLowerCase()}.`,
      at: scan.finishedAt,
    });
  }

  const groups = new Map<string, { kind: "removed" | "sent"; count: number; at: string }>();

  for (const attempt of history) {
    const kind =
      attempt.status === ATTEMPT_STATUS.SUCCESS
        ? "removed"
        : attempt.status === ATTEMPT_STATUS.SENT
          ? "sent"
          : null;
    if (!kind) continue;

    const key = `${kind}:${dayKey(attempt.createdAt)}`;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      if (attempt.createdAt > group.at) group.at = attempt.createdAt;
    } else {
      groups.set(key, { kind, count: 1, at: attempt.createdAt });
    }
  }

  for (const [key, group] of groups) {
    items.push(
      group.kind === "removed"
        ? {
            id: key,
            kind: "removed",
            title: `${plural(group.count, "subscription", "subscriptions")} removed`,
            detail:
              group.count === 1 ? "Confirmed by the sender." : "Confirmed by their senders.",
            at: group.at,
          }
        : {
            id: key,
            kind: "sent",
            title: `${plural(group.count, "request", "requests")} sent`,
            detail:
              group.count === 1
                ? "Waiting for the sender to confirm."
                : "Waiting for confirmation from the senders.",
            at: group.at,
          },
    );
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
