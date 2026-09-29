import { ApiRequestError, type ApiClient } from "@/lib/api/client";
import type {
  HistoryItemDto,
  SenderCountsDto,
  SenderDto,
  SendersResponse,
  SessionDto,
  ScanProgressDto,
  StatsDto,
  UnsubscribeResultDto,
} from "@/lib/api/types";
import {
  ATTEMPT_STATUS,
  PROTECTED_UNSUBSCRIBE_STATUSES,
  SCAN_STATUS,
  SENDER_STATUS,
  UNSUBSCRIBE_METHOD,
  type SenderStatus,
} from "@/lib/constants";
import { emailsPerMonth } from "@/lib/senders/derive";
import { RECENT_WINDOW_DAYS, summariseStats } from "@/lib/stats/summarise";
import { DEMO_ACCOUNT, DEMO_USER, demoManualUrl } from "@/lib/demo/data";
import {
  attemptDetail,
  clearState,
  loadState,
  mutate,
  startDemoScan,
  stepDemoScan,
  type DemoSender,
} from "@/lib/demo/store";

/**
 * The demo's stand-in for the server.
 *
 * It implements the same ApiClient interface as the real one and answers the
 * same paths, so every screen, hook and component in the signed-in app runs
 * unchanged inside /demo. What it does *not* do is leave the browser: there is
 * no fetch in this file, so the demo cannot send an email, open a real
 * unsubscribe endpoint, read a mailbox or touch the database — even if the
 * production deployment has Gmail credentials and a live database configured.
 *
 * Errors are thrown as ApiRequestError so the interface shows the same
 * messages, in the same places, as it does against the real API.
 */

/** Only these paths exist in the demo. Anything else is an honest 404. */
const BASE = "https://demo.tidely.invalid";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A stable per-sender wobble, so requests do not all return in lockstep. */
function jitter(id: string): number {
  let total = 0;
  for (let i = 0; i < id.length; i++) total = (total * 31 + id.charCodeAt(i)) >>> 0;
  return 260 + (total % 420);
}

function toDto(sender: DemoSender): SenderDto {
  return {
    id: sender.id,
    address: sender.address,
    name: sender.name,
    messageCount: sender.messageCount,
    perMonth: emailsPerMonth({
      messageCount: sender.messageCount,
      firstSeenAt: new Date(sender.firstSeenAt),
      lastSeenAt: new Date(sender.lastSeenAt),
    }),
    lastSeenAt: sender.lastSeenAt,
    sampleSubject: sender.sampleSubject,
    status: sender.status,
    canOneClick: sender.oneClick && sender.method !== null,
    canUnsubscribe:
      !PROTECTED_UNSUBSCRIBE_STATUSES.includes(sender.status) && sender.method !== null,
    manualUrl: sender.status === SENDER_STATUS.MANUAL ? sender.manualUrl : null,
  };
}

function toProgress(scan: NonNullable<ReturnType<typeof loadState>["scan"]>): ScanProgressDto {
  const done = scan.status !== SCAN_STATUS.RUNNING;
  return {
    scanId: scan.scanId,
    status: scan.status,
    processedMessages: scan.processedMessages,
    matchedMessages: scan.matchedMessages,
    foundSenders: loadState().senders.length,
    totalEstimate: scan.totalEstimate,
    fraction: scan.totalEstimate
      ? Math.min(1, scan.processedMessages / scan.totalEstimate)
      : 0,
    done,
    error: scan.error,
    lookbackDays: scan.lookbackDays,
    startedAt: scan.startedAt ?? null,
    finishedAt: scan.finishedAt ?? null,
  };
}

function countByStatus(senders: DemoSender[]): SenderCountsDto {
  const counts = Object.values(SENDER_STATUS).reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as SenderCountsDto);
  for (const sender of senders) counts[sender.status] += 1;
  return counts;
}

function listSenders(params: URLSearchParams): SendersResponse {
  const { senders } = loadState();
  const status = params.get("status") ?? SENDER_STATUS.ACTIVE;
  const search = (params.get("search") ?? "").trim().toLowerCase();
  const sort = params.get("sort") ?? "count";
  const limit = Number(params.get("limit") ?? 200);
  const offset = Number(params.get("offset") ?? 0);

  let rows = senders.filter((sender) => status === "ALL" || sender.status === status);

  if (search) {
    rows = rows.filter(
      (sender) =>
        sender.address.toLowerCase().includes(search) ||
        (sender.name ?? "").toLowerCase().includes(search),
    );
  }

  rows = [...rows].sort((a, b) => {
    if (sort === "recent") return b.lastSeenAt.localeCompare(a.lastSeenAt);
    if (sort === "name") return (a.name ?? a.address).localeCompare(b.name ?? b.address);
    return b.messageCount - a.messageCount || b.lastSeenAt.localeCompare(a.lastSeenAt);
  });

  return {
    senders: rows.slice(offset, offset + limit).map(toDto),
    counts: countByStatus(senders),
    total: rows.length,
  };
}

function computeDemoStats(): StatsDto {
  const { senders } = loadState();
  const cutoff = Date.now() - RECENT_WINDOW_DAYS * 86_400_000;
  const previousCutoff = Date.now() - RECENT_WINDOW_DAYS * 2 * 86_400_000;

  const group = (rows: DemoSender[]) => {
    const byStatus = new Map<string, { senderCount: number; volume: number }>();
    for (const sender of rows) {
      const entry = byStatus.get(sender.status) ?? { senderCount: 0, volume: 0 };
      entry.senderCount += 1;
      entry.volume += sender.messageCount;
      byStatus.set(sender.status, entry);
    }
    return [...byStatus].map(([status, entry]) => ({ status, ...entry }));
  };

  const decidedAt = (sender: DemoSender) =>
    sender.decidedAt ? new Date(sender.decidedAt).getTime() : null;

  return summariseStats({
    confirmed: senders
      .filter((s) => s.status === SENDER_STATUS.UNSUBSCRIBED)
      .map((s) => ({
        messageCount: s.messageCount,
        firstSeenAt: new Date(s.firstSeenAt),
        lastSeenAt: new Date(s.lastSeenAt),
      })),
    all: group(senders),
    recent: group(
      senders.filter((s) => {
        const at = decidedAt(s);
        return at !== null && at >= cutoff;
      }),
    ),
    previous: group(
      senders.filter((s) => {
        const at = decidedAt(s);
        return at !== null && at >= previousCutoff && at < cutoff;
      }),
    ),
  });
}

function history(): HistoryItemDto[] {
  const { senders, attempts } = loadState();
  const byId = new Map(senders.map((sender) => [sender.id, sender]));

  return attempts
    .filter((attempt) => byId.has(attempt.senderId))
    .map((attempt) => {
      const sender = byId.get(attempt.senderId)!;
      return {
        id: attempt.id,
        senderId: sender.id,
        senderAddress: sender.address,
        senderName: sender.name,
        method: attempt.method,
        status: attempt.status,
        detail: attempt.detail,
        createdAt: attempt.createdAt,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function changeStatus(id: string, status: SenderStatus): SenderDto {
  const state = loadState();
  const sender = state.senders.find((candidate) => candidate.id === id);
  if (!sender) throw new ApiRequestError("Sender not found.", 404);

  if (PROTECTED_UNSUBSCRIBE_STATUSES.includes(sender.status)) {
    throw new ApiRequestError(
      "This unsubscribe is already in progress or has been sent. Refresh the list to see its status.",
      409,
    );
  }

  mutate((draft) => {
    const row = draft.senders.find((candidate) => candidate.id === id);
    if (!row) return;
    row.status = status;
    row.decidedAt = status === SENDER_STATUS.ACTIVE ? null : new Date().toISOString();
    if (status !== SENDER_STATUS.MANUAL) row.manualUrl = null;
  });

  return toDto(loadState().senders.find((candidate) => candidate.id === id)!);
}

async function unsubscribe(id: string): Promise<UnsubscribeResultDto> {
  const sender = loadState().senders.find((candidate) => candidate.id === id);
  if (!sender) throw new ApiRequestError("Sender not found.", 404);

  if (PROTECTED_UNSUBSCRIBE_STATUSES.includes(sender.status)) {
    return {
      senderId: id,
      status: sender.status,
      method: null,
      manualUrl: null,
      detail:
        sender.status === SENDER_STATUS.UNSUBSCRIBED
          ? "Already unsubscribed from this sender."
          : "An unsubscribe email has already been sent. Removal is not confirmed.",
    };
  }

  // Standing in for the round trip to a stranger's unsubscribe endpoint.
  await delay(jitter(id));

  const outcome = sender.method ? sender.outcome : "FAILED";
  const method = sender.method ?? UNSUBSCRIBE_METHOD.HTTP;
  const detail = attemptDetail(outcome, sender);

  const status: SenderStatus =
    outcome === "SUCCESS"
      ? SENDER_STATUS.UNSUBSCRIBED
      : outcome === "SENT"
        ? SENDER_STATUS.REQUESTED
        : outcome === "MANUAL"
          ? SENDER_STATUS.MANUAL
          : SENDER_STATUS.FAILED;

  const attemptStatus =
    outcome === "SUCCESS"
      ? ATTEMPT_STATUS.SUCCESS
      : outcome === "SENT"
        ? ATTEMPT_STATUS.SENT
        : outcome === "MANUAL"
          ? ATTEMPT_STATUS.MANUAL_REQUIRED
          : ATTEMPT_STATUS.FAILED;

  const manualUrl = outcome === "MANUAL" ? demoManualUrl(id) : null;
  const now = new Date().toISOString();

  mutate((draft) => {
    const row = draft.senders.find((candidate) => candidate.id === id);
    if (!row) return;
    row.status = status;
    row.decidedAt = now;
    row.manualUrl = manualUrl;
    draft.attempts.unshift({
      id: `attempt-${id}-${Date.now()}`,
      senderId: id,
      method,
      status: attemptStatus,
      detail: manualUrl ?? detail,
      createdAt: now,
    });
  });

  return { senderId: id, status, method, manualUrl, detail };
}

function session(): SessionDto {
  return {
    user: { id: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name, image: null },
    account: DEMO_ACCOUNT,
  };
}

async function handle(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = new URL(path, BASE);
  const route = `${method} ${url.pathname}`;
  const payload = (body ?? {}) as Record<string, unknown>;

  switch (route) {
    case "GET /api/me":
      return session();

    case "GET /api/stats":
      return computeDemoStats();

    case "GET /api/senders":
      return listSenders(url.searchParams);

    case "GET /api/history":
      return history();

    case "GET /api/scan": {
      const { scan } = loadState();
      return scan ? toProgress(scan) : null;
    }

    case "POST /api/scan/start": {
      const lookbackDays = Number(payload.lookbackDays ?? 30);
      return toProgress(startDemoScan(lookbackDays));
    }

    case "POST /api/scan/step":
      // Long enough that the progress bar reads as work, short enough not to drag.
      await delay(220);
      return toProgress(stepDemoScan());

    case "POST /api/unsubscribe":
      return unsubscribe(String(payload.senderId ?? ""));

    case "POST /api/auth/logout":
      return { ok: true };

    default: {
      const patchSender = /^\/api\/senders\/([^/]+)$/.exec(url.pathname);
      if (method === "PATCH" && patchSender) {
        return changeStatus(
          decodeURIComponent(patchSender[1]),
          payload.status as SenderStatus,
        );
      }
      throw new ApiRequestError("That is not part of the demo.", 404);
    }
  }
}

export const demoClient: ApiClient = {
  get: <T>(path: string) => handle("GET", path) as Promise<T>,
  post: <T>(path: string, json?: unknown) => handle("POST", path, json) as Promise<T>,
  patch: <T>(path: string, json?: unknown) => handle("PATCH", path, json) as Promise<T>,
};

/** Puts the demo back to how the visitor found it. */
export function resetDemo(): void {
  clearState();
  if (typeof window !== "undefined") window.location.reload();
}
