import { ApiRequestError } from "@/lib/api/client";
import type {
  ClearOutAccessDto,
  ClearOutChunkResponse,
  ClearOutLabelDto,
  ClearOutListResponse,
  ClearOutMessageDto,
  ClearOutPreviewDto,
  ClearOutResolveResponse,
  ClearOutRunDto,
  SenderSuggestionDto,
} from "@/lib/api/types";
import {
  CHUNK_SIZE,
  MAX_SELECTION,
  isClearOutAction,
  isMessageId,
  labelChange,
} from "@/lib/clearout/actions";
import { matchesQuery, readQuery, type ClearOutQuery, type UnsubscribedList } from "@/lib/clearout/filters";
import { SENDER_STATUS } from "@/lib/constants";
import { DEMO_LABELS, DEMO_ME } from "@/lib/demo/mailbox";
import { loadState, mutate, type DemoMessage } from "@/lib/demo/store";
import type { DemoMailboxId } from "@/lib/demo/data";

/**
 * Clear out in the demo.
 *
 * The same paths and shapes as /api/clear-out, answered from the sample
 * mailbox in this browser. Every action changes only that local copy: there
 * is no fetch here, so nothing can reach Gmail, send an email or unsubscribe
 * anyone. Unlike Gmail, the demo always knows its exact totals.
 */

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const labelNames = new Map(DEMO_LABELS.map((label) => [label.id, label.name]));

function toDto(message: DemoMessage): ClearOutMessageDto {
  return {
    id: message.id,
    threadId: message.threadId,
    fromName: message.fromName,
    fromAddress: message.fromAddress,
    to: message.to,
    sentByMe: message.labelIds.includes("SENT") || message.fromAddress === DEMO_ME.address,
    subject: message.subject,
    snippet: message.snippet,
    receivedAt: message.receivedAt,
    unread: message.labelIds.includes("UNREAD"),
    inInbox: message.labelIds.includes("INBOX"),
    hasAttachment: Boolean(message.hasAttachment),
    sizeBytes: message.sizeBytes,
    labels: message.labelIds
      .filter((id) => labelNames.has(id))
      .map((id) => ({ id, name: labelNames.get(id)! })),
    // Nothing real to open.
    gmailUrl: null,
  };
}

/** Confirmed unsubscribes in the demo, by exact address, as Cleanup recorded them. */
function unsubscribedLists(box: DemoMailboxId): UnsubscribedList[] {
  return loadState(box)
    .senders.filter((sender) => sender.status === SENDER_STATUS.UNSUBSCRIBED)
    .map((sender) => ({ address: sender.address.toLowerCase(), listIds: [] }));
}

function matching(box: DemoMailboxId, query: ClearOutQuery): DemoMessage[] {
  const lists = query.unsubscribed ? unsubscribedLists(box) : [];
  return loadState(box)
    .mailbox.filter((message) =>
      matchesQuery(
        {
          fromAddress: message.fromAddress,
          fromName: message.fromName,
          to: message.to,
          subject: message.subject,
          snippet: message.snippet,
          receivedAt: Date.parse(message.receivedAt),
          unread: message.labelIds.includes("UNREAD"),
          hasAttachment: Boolean(message.hasAttachment),
          sizeBytes: message.sizeBytes,
          labelIds: message.labelIds,
          listId: message.listId ?? null,
        },
        query,
        lists,
      ),
    )
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

function parse(input: URLSearchParams | Record<string, unknown>): ClearOutQuery {
  try {
    return readQuery(input);
  } catch {
    throw new ApiRequestError("That filter isn’t valid. Clear it and try again.", 400);
  }
}

/** Page tokens are plain offsets here; the page treats them as opaque. */
function offsetOf(token: string | null | undefined): number {
  const n = Number(token ?? 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function list(box: DemoMailboxId, params: URLSearchParams): ClearOutListResponse {
  const query = parse(params);
  if (query.label && !labelNames.has(query.label)) {
    throw new ApiRequestError("That label no longer exists.", 404);
  }
  const rows = matching(box, query);
  const start = offsetOf(params.get("pageToken"));
  const size = Math.min(50, Math.max(1, Number(params.get("pageSize") ?? 20) || 20));
  const page = rows.slice(start, start + size);
  const notes =
    query.unsubscribed && unsubscribedLists(box).length === 0
      ? ["You haven’t confirmed an unsubscribe from any list yet."]
      : [];
  return {
    messages: page.map(toDto),
    nextPageToken: start + size < rows.length ? String(start + size) : null,
    total: rows.length,
    totalExact: true,
    notes,
  };
}

function preview(box: DemoMailboxId, id: string): ClearOutPreviewDto {
  const message = loadState(box).mailbox.find((candidate) => candidate.id === id);
  if (!message || message.labelIds.includes("TRASH")) {
    throw new ApiRequestError("That email is no longer in your mailbox.", 404);
  }
  return { ...toDto(message), cc: null };
}

function suggestions(box: DemoMailboxId, term: string): SenderSuggestionDto[] {
  const needle = term.trim().toLowerCase();
  const seen = new Map<string, SenderSuggestionDto>();
  const add = (name: string | null, address: string) => {
    const key = address.toLowerCase();
    if (key === DEMO_ME.address || seen.has(key)) return;
    if (needle && !key.includes(needle) && !(name ?? "").toLowerCase().includes(needle)) return;
    seen.set(key, { name, address: key });
  };
  const { mailbox, senders } = loadState(box);
  for (const message of [...mailbox].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))) {
    add(message.fromName, message.fromAddress);
  }
  for (const sender of senders) add(sender.name, sender.address);
  return [...seen.values()].slice(0, 12);
}

function runDto(run: ReturnType<typeof loadState>["clearOutRuns"][number]): ClearOutRunDto {
  const { labelId: _labelId, ...rest } = run;
  return rest;
}

function startRun(box: DemoMailboxId, payload: Record<string, unknown>): ClearOutRunDto {
  const action = payload.action;
  const requested = Number(payload.requested);
  if (!isClearOutAction(action) || !Number.isInteger(requested) || requested < 1 || requested > MAX_SELECTION) {
    throw new ApiRequestError("Invalid request parameters.", 400);
  }
  let labelId: string | null = null;
  if (action === "label") {
    labelId = typeof payload.labelId === "string" ? payload.labelId : null;
    if (!labelId || !labelNames.has(labelId)) {
      throw new ApiRequestError("That label no longer exists.", 404);
    }
  }
  const now = new Date().toISOString();
  const run = {
    id: `run-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    action,
    labelId,
    labelName: labelId ? labelNames.get(labelId)! : null,
    requested,
    succeeded: 0,
    failed: 0,
    createdAt: now,
    updatedAt: now,
  };
  mutate((state) => {
    state.clearOutRuns.unshift(run);
    state.clearOutRuns = state.clearOutRuns.slice(0, 50);
  }, box);
  return runDto(run);
}

/**
 * One batch, applied to exactly these local messages and nothing else in
 * their conversations. One sample message is set up to fail its first
 * attempt, so the partial-failure and retry path can be tried for real.
 */
async function applyChunk(
  box: DemoMailboxId,
  runId: string,
  payload: Record<string, unknown>,
): Promise<ClearOutChunkResponse> {
  const run = loadState(box).clearOutRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new ApiRequestError("Action not found.", 404);

  const raw = Array.isArray(payload.ids) ? payload.ids : [];
  const ids = [...new Set(raw.filter(isMessageId))];
  if (ids.length === 0 || ids.length !== raw.length || ids.length > CHUNK_SIZE[run.action]) {
    throw new ApiRequestError("Invalid request parameters.", 400);
  }
  const retry = payload.retry === true;

  // Standing in for the round trip to Gmail.
  await delay(260 + ids.length * 4);

  const succeeded: string[] = [];
  const failed: string[] = [];

  mutate((state) => {
    for (const id of ids) {
      const message = state.mailbox.find((candidate) => candidate.id === id);
      if (!message || message.labelIds.includes("TRASH")) {
        failed.push(id);
        continue;
      }
      if (message.flaky) {
        message.flaky = false;
        failed.push(id);
        continue;
      }
      if (run.action === "trash") {
        message.labelIds = [...message.labelIds.filter((label) => label !== "INBOX"), "TRASH"];
      } else {
        const { add, remove } = labelChange(run.action, run.labelId);
        const next = message.labelIds.filter((label) => !remove.includes(label));
        for (const label of add) if (!next.includes(label)) next.push(label);
        message.labelIds = next;
      }
      succeeded.push(id);
    }

    const stored = state.clearOutRuns.find((candidate) => candidate.id === runId);
    if (stored) {
      stored.succeeded = Math.min(stored.requested, stored.succeeded + succeeded.length);
      stored.failed = retry
        ? Math.max(0, stored.failed - succeeded.length)
        : Math.min(stored.requested - stored.succeeded, stored.failed + failed.length);
      stored.updatedAt = new Date().toISOString();
    }
  }, box);

  const stored = loadState(box).clearOutRuns.find((candidate) => candidate.id === runId)!;
  return { run: runDto(stored), succeeded, failed };
}

/** Answers a Clear out path, or returns undefined when the path is not one. */
export async function handleClearOut(
  method: "GET" | "POST" | "PATCH",
  url: URL,
  payload: Record<string, unknown>,
  /** The sample mailbox the request named. Each has its own messages and History. */
  box: DemoMailboxId,
): Promise<unknown> {
  const path = url.pathname;
  if (!path.startsWith("/api/clear-out/")) return undefined;

  if (method === "GET" && path === "/api/clear-out/access") {
    return { canRead: true, canOrganise: true, grantUrl: null } satisfies ClearOutAccessDto;
  }
  if (method === "GET" && path === "/api/clear-out/messages") {
    await delay(160);
    return list(box, url.searchParams);
  }
  if (method === "GET" && path === "/api/clear-out/labels") {
    return DEMO_LABELS satisfies ClearOutLabelDto[];
  }
  if (method === "GET" && path === "/api/clear-out/senders") {
    return suggestions(box, url.searchParams.get("q") ?? "");
  }
  if (method === "GET" && path === "/api/clear-out/runs") {
    return loadState(box).clearOutRuns.map(runDto);
  }
  if (method === "POST" && path === "/api/clear-out/runs") {
    return startRun(box, payload);
  }
  if (method === "POST" && path === "/api/clear-out/summaries") {
    const ids = Array.isArray(payload.ids) ? payload.ids.filter(isMessageId).slice(0, 50) : [];
    const byId = new Map(loadState(box).mailbox.map((message) => [message.id, message]));
    return ids.map((id) => byId.get(id)).filter((m): m is DemoMessage => Boolean(m)).map(toDto);
  }
  if (method === "POST" && path === "/api/clear-out/resolve") {
    const query = parse((payload.query ?? {}) as Record<string, unknown>);
    const rows = matching(box, query);
    const start = offsetOf(payload.pageToken as string | null);
    // Small pages and a pause, so the progress a large mailbox shows is visible here too.
    await delay(220);
    const size = 40;
    return {
      ids: rows.slice(start, start + size).map((message) => message.id),
      nextPageToken: start + size < rows.length ? String(start + size) : null,
      estimate: rows.length,
    } satisfies ClearOutResolveResponse;
  }

  const one = /^\/api\/clear-out\/messages\/([^/]+)$/.exec(path);
  if (method === "GET" && one) return preview(box, decodeURIComponent(one[1]));

  const chunk = /^\/api\/clear-out\/runs\/([^/]+)$/.exec(path);
  if (method === "POST" && chunk) return applyChunk(box, decodeURIComponent(chunk[1]), payload);

  return undefined;
}
