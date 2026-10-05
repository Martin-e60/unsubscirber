import { ApiRequestError, type ApiClient, type RequestOptions } from "@/lib/api/client";
import type {
  HistoryItemDto,
  MailboxDto,
  MailboxesResponse,
  SenderCountsDto,
  SenderDto,
  SendersResponse,
  SessionDto,
  ScanProgressDto,
  StatsDto,
  UnsubscribedResponse,
  UnsubscribeResultDto,
} from "@/lib/api/types";
import { lookbackToCover, observe, type CompletedCheck } from "@/lib/followup/match";
import { toArchiveItem } from "@/lib/followup/archive";
import {
  ATTEMPT_STATUS,
  DEFAULT_LOOKBACK_DAYS,
  LOOKBACK_OPTIONS,
  PROTECTED_UNSUBSCRIBE_STATUSES,
  SCAN_STATUS,
  SENDER_STATUS,
  UNSUBSCRIBE_METHOD,
  type SenderStatus,
} from "@/lib/constants";
import { emailsPerMonth } from "@/lib/senders/derive";
import { RECENT_WINDOW_DAYS, summariseStats } from "@/lib/stats/summarise";
import {
  DEMO_ACCOUNT,
  DEMO_MAILBOXES,
  DEMO_USER,
  demoManualUrl,
  isDemoMailboxId,
  type DemoMailboxId,
} from "@/lib/demo/data";
import { MAILBOX_NOT_FOUND } from "@/lib/mailbox/shared";
import { handleClearOut } from "@/lib/demo/clearout";
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
    firstSeenAt: sender.firstSeenAt,
    sampleSubject: sender.sampleSubject,
    status: sender.status,
    canOneClick: sender.oneClick && sender.method !== null,
    canUnsubscribe:
      !PROTECTED_UNSUBSCRIBE_STATUSES.includes(sender.status) && sender.method !== null,
    manualUrl: sender.status === SENDER_STATUS.MANUAL ? sender.manualUrl : null,
  };
}

function toProgress(box: DemoMailboxId, scan: NonNullable<ReturnType<typeof loadState>["scan"]>): ScanProgressDto {
  const done = scan.status !== SCAN_STATUS.RUNNING;
  return {
    scanId: scan.scanId,
    status: scan.status,
    processedMessages: scan.processedMessages,
    matchedMessages: scan.matchedMessages,
    foundSenders: loadState(box).senders.length,
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

function listSenders(box: DemoMailboxId, params: URLSearchParams): SendersResponse {
  const { senders } = loadState(box);
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

  // "Most emails" orders by the monthly rate the list shows, as the server does.
  const rate = (sender: DemoSender) => toDto(sender).perMonth;

  rows = [...rows].sort((a, b) => {
    if (sort === "recent") return b.lastSeenAt.localeCompare(a.lastSeenAt);
    if (sort === "name") return (a.name ?? a.address).localeCompare(b.name ?? b.address);
    return (
      rate(b) - rate(a) ||
      b.messageCount - a.messageCount ||
      b.lastSeenAt.localeCompare(a.lastSeenAt)
    );
  });

  return {
    senders: rows.slice(offset, offset + limit).map(toDto),
    counts: countByStatus(senders),
    total: rows.length,
  };
}

function computeDemoStats(box: DemoMailboxId): StatsDto {
  const { senders } = loadState(box);
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

function history(box: DemoMailboxId): HistoryItemDto[] {
  const { senders, attempts } = loadState(box);
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

function changeStatus(box: DemoMailboxId, id: string, status: SenderStatus): SenderDto {
  const state = loadState(box);
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
  }, box);

  return toDto(loadState(box).senders.find((candidate) => candidate.id === id)!);
}

async function unsubscribe(box: DemoMailboxId, id: string): Promise<UnsubscribeResultDto> {
  const sender = loadState(box).senders.find((candidate) => candidate.id === id);
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
  }, box);

  return { senderId: id, status, method, manualUrl, detail };
}

/**
 * The Unsubscribed archive, from the visitor's sample data and the same rules
 * the server uses. Sample messages get no Gmail link: there is nothing real
 * for one to open.
 */
function archive(box: DemoMailboxId, params: URLSearchParams): UnsubscribedResponse {
  const { senders, attempts, followUps, lastDone: scan } = loadState(box);
  const search = (params.get("search") ?? "").trim().toLowerCase();
  const senderId = params.get("senderId");
  const limit = Number(params.get("limit") ?? 10);
  const offset = Number(params.get("offset") ?? 0);

  const confirmedAt = (sender: DemoSender): Date | null => {
    const success = attempts
      .filter((a) => a.senderId === sender.id && a.status === ATTEMPT_STATUS.SUCCESS)
      .map((a) => a.createdAt)
      .sort()
      .at(-1);
    const at = success ?? sender.decidedAt;
    return at ? new Date(at) : null;
  };

  const all = senders
    .filter((sender) => sender.status === SENDER_STATUS.UNSUBSCRIBED)
    .map((sender) => ({ sender, at: confirmedAt(sender) }))
    .sort(
      (a, b) =>
        (b.at?.getTime() ?? -Infinity) - (a.at?.getTime() ?? -Infinity) ||
        (a.sender.name ?? a.sender.address).localeCompare(b.sender.name ?? b.sender.address),
    );

  const matching = all.filter(
    ({ sender }) =>
      (!senderId || sender.id === senderId) &&
      (!search ||
        sender.address.toLowerCase().includes(search) ||
        (sender.name ?? "").toLowerCase().includes(search)),
  );

  const latestCheck: CompletedCheck | null =
    scan && scan.status === SCAN_STATUS.DONE && scan.finishedAt
      ? {
          startedAt: new Date(scan.startedAt),
          finishedAt: new Date(scan.finishedAt),
          lookbackDays: scan.lookbackDays,
        }
      : null;

  const dated = all.map(({ at }) => at).filter((at): at is Date => at !== null);
  const oldest = dated.length ? new Date(Math.min(...dated.map((d) => d.getTime()))) : null;

  return {
    items: matching.slice(offset, offset + limit).map(({ sender, at }) =>
      toArchiveItem({
        senderId: sender.id,
        name: sender.name,
        address: sender.address,
        unsubscribedAt: at,
        observation: observe({
          unsubscribedAt: at,
          earlierListIds: [],
          messages: followUps
            .filter((message) => message.senderId === sender.id)
            .map((message) => ({
              id: message.id,
              receivedAt: new Date(message.receivedAt),
              listId: null,
              subject: message.subject,
            })),
          latestCheck,
        }),
        messageUrl: () => null,
        unsubscribeHttp: null,
      }),
    ),
    total: matching.length,
    archiveTotal: all.length,
    lastCheck: latestCheck
      ? { finishedAt: latestCheck.finishedAt.toISOString(), lookbackDays: latestCheck.lookbackDays }
      : null,
    checkLookbackDays: lookbackToCover(oldest, LOOKBACK_OPTIONS, DEFAULT_LOOKBACK_DAYS),
  };
}

/** Which sample mailbox a fresh demo tab opens on: the one picked last. */
const ACTIVE_KEY = "tidely.demo.v1.active";
let rememberedBox: DemoMailboxId | null = null;

function remembered(): DemoMailboxId {
  if (rememberedBox) return rememberedBox;
  try {
    const stored = typeof window === "undefined" ? null : window.localStorage.getItem(ACTIVE_KEY);
    if (isDemoMailboxId(stored)) rememberedBox = stored;
  } catch {
    // Storage blocked: start on the first mailbox.
  }
  return rememberedBox ?? (DEMO_ACCOUNT.id as DemoMailboxId);
}

function remember(box: DemoMailboxId): void {
  rememberedBox = box;
  try {
    window.localStorage.setItem(ACTIVE_KEY, box);
  } catch {
    // Kept in memory for this tab.
  }
}

/** A fixed, plausible connection date: the sample mailboxes were connected months ago. */
const CONNECTED_AT = ["2026-03-14T09:20:00.000Z", "2026-06-02T13:05:00.000Z"];

function mailboxes(): MailboxDto[] {
  return DEMO_MAILBOXES.map((mailbox, index) => ({
    id: mailbox.id,
    email: mailbox.email,
    provider: mailbox.provider,
    label: mailbox.label,
    needsReconnect: false,
    canOrganise: true,
    connectedAt: CONNECTED_AT[index] ?? CONNECTED_AT[0],
  }));
}

function session(): SessionDto {
  const active = DEMO_MAILBOXES.find((mailbox) => mailbox.id === remembered()) ?? DEMO_MAILBOXES[0];
  return {
    user: { id: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name, image: null },
    mailboxes: mailboxes(),
    activeMailboxId: active.id,
    account: { id: active.id, email: active.email, provider: active.provider },
  };
}

async function handle(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<unknown> {
  const url = new URL(path, BASE);
  const route = `${method} ${url.pathname}`;
  const payload = (body ?? {}) as Record<string, unknown>;

  // Like the real API: a request names its mailbox, and only the demo's own
  // two exist. Without one it is the mailbox the demo opens on.
  if (options.mailboxId != null && !isDemoMailboxId(options.mailboxId)) {
    throw new ApiRequestError("That mailbox is no longer connected to your account.", 404, MAILBOX_NOT_FOUND);
  }
  const box: DemoMailboxId = options.mailboxId ?? (DEMO_ACCOUNT.id as DemoMailboxId);

  switch (route) {
    case "GET /api/me":
      return session();

    case "GET /api/mailboxes":
      return { mailboxes: mailboxes(), activeMailboxId: session().activeMailboxId } satisfies MailboxesResponse;

    case "POST /api/mailboxes/active": {
      if (!isDemoMailboxId(payload.mailboxId)) {
        throw new ApiRequestError("That mailbox is no longer connected to your account.", 404, MAILBOX_NOT_FOUND);
      }
      remember(payload.mailboxId);
      return { activeMailboxId: payload.mailboxId };
    }

    case "GET /api/stats":
      return computeDemoStats(box);

    case "GET /api/senders":
      return listSenders(box, url.searchParams);

    case "GET /api/history":
      return history(box);

    case "GET /api/unsubscribed":
      return archive(box, url.searchParams);

    case "GET /api/scan": {
      const { scan } = loadState(box);
      return scan ? toProgress(box, scan) : null;
    }

    case "POST /api/scan/start": {
      const lookbackDays = Number(payload.lookbackDays ?? 30);
      return toProgress(box, startDemoScan(lookbackDays, box));
    }

    case "POST /api/scan/step":
      // Long enough that the progress bar reads as work, short enough not to drag.
      await delay(220);
      return toProgress(box, stepDemoScan(box));

    case "POST /api/unsubscribe":
      return unsubscribe(box, String(payload.senderId ?? ""));

    case "POST /api/auth/logout":
      return { ok: true };

    default: {
      if (method === "DELETE") throw new ApiRequestError("That is not part of the demo.", 404);

      const clearOut = await handleClearOut(method, url, payload, box);
      if (clearOut !== undefined) return clearOut;

      const patchSender = /^\/api\/senders\/([^/]+)$/.exec(url.pathname);
      if (method === "PATCH" && patchSender) {
        return changeStatus(
          box,
          decodeURIComponent(patchSender[1]),
          payload.status as SenderStatus,
        );
      }
      throw new ApiRequestError("That is not part of the demo.", 404);
    }
  }
}

export const demoClient: ApiClient = {
  get: <T>(path: string, options?: RequestOptions) => handle("GET", path, undefined, options) as Promise<T>,
  post: <T>(path: string, json?: unknown, options?: RequestOptions) =>
    handle("POST", path, json, options) as Promise<T>,
  patch: <T>(path: string, json?: unknown, options?: RequestOptions) =>
    handle("PATCH", path, json, options) as Promise<T>,
  del: <T>(path: string, options?: RequestOptions) => handle("DELETE", path, undefined, options) as Promise<T>,
};

/** Puts the demo back to how the visitor found it — both sample mailboxes. */
export function resetDemo(): void {
  clearState();
  rememberedBox = null;
  try {
    window.localStorage.removeItem(ACTIVE_KEY);
    window.sessionStorage.removeItem("tidely.demo.mailbox");
  } catch {
    // Nothing stored.
  }
  if (typeof window !== "undefined") window.location.reload();
}
