"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "@/lib/api/client";
import { useApi } from "@/lib/api/context";
import { useMailboxOperation } from "@/components/layout/MailboxContext";
import type {
  ClearOutAccessDto,
  ClearOutChunkResponse,
  ClearOutLabelDto,
  ClearOutListResponse,
  ClearOutResolveResponse,
  ClearOutRunDto,
} from "@/lib/api/types";
import { CHUNK_SIZE, MAX_SELECTION, type ClearOutAction } from "@/lib/clearout/actions";
import {
  filterKey,
  queryParams,
  toQuery,
  type ClearOutFilter,
} from "@/lib/clearout/filters";

/**
 * Clear out's data, with no rendering decisions in it: the list a page at a
 * time, the mailbox's labels and permissions, History, "select all
 * matching", and running an action in confirmed batches.
 *
 * The same hooks run against the real API and the demo's local one.
 */

// --- The list -----------------------------------------------------------------

export function useMessageList(filter: ClearOutFilter, pageSize: number, enabled: boolean) {
  const api = useApi();
  const key = filterKey(filter);

  // Gmail pages by token, not by number: page i is reached with tokens[i].
  // Only pages already reached can be jumped to.
  const [tokens, setTokens] = useState<(string | null)[]>([null]);
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<ClearOutListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);

  const latest = useRef(0);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;

  const load = useCallback(
    async (at: number) => {
      const id = ++latest.current;
      setLoading(true);
      try {
        const params = queryParams(toQuery(filterRef.current));
        const token = tokensRef.current[at] ?? null;
        if (token) params.set("pageToken", token);
        params.set("pageSize", String(pageSize));
        params.set("offset", String(at * pageSize));
        const result = await api.get<ClearOutListResponse>(`/api/clear-out/messages?${params}`);
        if (id !== latest.current) return;

        // Anything past this page may have shifted; it is learned again.
        setTokens((current) => {
          const next = current.slice(0, at + 1);
          if (result.nextPageToken) next.push(result.nextPageToken);
          return next;
        });
        setData(result);
        setIndex(at);
        setError(null);
      } catch (cause) {
        if (id !== latest.current) return;
        setError({
          message: cause instanceof Error ? cause.message : "Couldn’t load your emails.",
          status: cause instanceof ApiRequestError ? cause.status : 0,
        });
      } finally {
        if (id === latest.current) setLoading(false);
      }
    },
    [api, pageSize],
  );

  // A different result set starts again from its first page.
  useEffect(() => {
    if (!enabled) return;
    tokensRef.current = [null];
    setTokens([null]);
    setData(null);
    void load(0);
  }, [key, enabled, load]);

  /** Reloads the page on screen, e.g. after an action changed the mail. */
  const refresh = useCallback(async () => {
    await load(index);
  }, [load, index]);

  // An action can empty the page on screen; step back to one with mail.
  useEffect(() => {
    if (!loading && data && data.messages.length === 0 && index > 0) void load(index - 1);
  }, [loading, data, index, load]);

  return {
    data,
    messages: data?.messages ?? [],
    loading,
    error,
    page: index,
    knownPages: tokens.length,
    hasNext: index + 1 < tokens.length,
    goTo: (page: number) => {
      if (page >= 0 && page < tokensRef.current.length) void load(page);
    },
    refresh,
  };
}

// --- Labels, access, history ----------------------------------------------------

export function useClearOutBasics(enabled: boolean) {
  const api = useApi();
  const [labels, setLabels] = useState<ClearOutLabelDto[] | null>(null);
  const [access, setAccess] = useState<ClearOutAccessDto | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    api
      .get<ClearOutAccessDto>("/api/clear-out/access")
      .then((value) => live && setAccess(value))
      .catch(() => live && setAccess({ canRead: true, canOrganise: false, grantUrl: null }));
    api
      .get<ClearOutLabelDto[]>("/api/clear-out/labels")
      .then((value) => live && setLabels(value))
      .catch(() => live && setLabels([]));
    return () => {
      live = false;
    };
  }, [api, enabled]);

  return {
    labels,
    access,
    /** After a permission failure: the grant is not what was thought. */
    lostOrganise: useCallback(
      () =>
        setAccess((current) => ({
          canRead: current?.canRead ?? true,
          canOrganise: false,
          grantUrl: current?.grantUrl ?? "/api/auth/google/start?mode=connect&access=organise",
        })),
      [],
    ),
  };
}

export function useClearOutHistory() {
  const api = useApi();
  const [runs, setRuns] = useState<ClearOutRunDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRuns(await api.get<ClearOutRunDto[]>("/api/clear-out/runs"));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t load History.");
    }
  }, [api]);

  return { runs, error, refresh };
}

// --- Select all matching -----------------------------------------------------------

export type Resolving = { found: number; estimate: number };

/**
 * Gathers the id of every email matching the filter, a page at a time, so
 * the exact number is known before an action is offered. Can be stopped.
 */
export function useResolveAll() {
  const api = useApi();
  const [progress, setProgress] = useState<Resolving | null>(null);
  const cancelled = useRef(false);

  const resolve = useCallback(
    async (filter: ClearOutFilter): Promise<{ ids: string[]; capped: boolean } | null> => {
      cancelled.current = false;
      setProgress({ found: 0, estimate: 0 });
      const query = toQuery(filter);
      const ids: string[] = [];
      let token: string | null = null;
      try {
        do {
          const page: ClearOutResolveResponse = await api.post<ClearOutResolveResponse>(
            "/api/clear-out/resolve",
            { query, pageToken: token },
          );
          if (cancelled.current) return null;
          for (const id of page.ids) if (!ids.includes(id)) ids.push(id);
          token = page.nextPageToken;
          setProgress({ found: ids.length, estimate: Math.max(page.estimate, ids.length) });
          if (ids.length >= MAX_SELECTION) return { ids: ids.slice(0, MAX_SELECTION), capped: Boolean(token) || ids.length > MAX_SELECTION };
        } while (token);
        return { ids, capped: false };
      } finally {
        setProgress(null);
      }
    },
    [api],
  );

  return {
    progress,
    resolve,
    cancel: useCallback(() => {
      cancelled.current = true;
      setProgress(null);
    }, []),
  };
}

// --- Running an action ---------------------------------------------------------------

export type RunOutcome = {
  action: ClearOutAction;
  labelName: string | null;
  run: ClearOutRunDto | null;
  succeeded: string[];
  failed: string[];
  /** Never sent: the person stopped, or permission was missing. */
  skipped: string[];
  /** Why it stopped early, in words for a person. */
  stoppedBy: "user" | "permission" | "error" | null;
  errorMessage: string | null;
};

export type RunProgress = { action: ClearOutAction; done: number; total: number };

/**
 * Sends a frozen list of ids in batches and reports only what was confirmed.
 * One run at a time; a second press while one is going does nothing.
 */
export function useActionRunner() {
  const api = useApi();
  const beginOperation = useMailboxOperation();
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const busy = useRef(false);
  const stop = useRef(false);

  const execute = useCallback(
    async (input: {
      action: ClearOutAction;
      ids: string[];
      labelId?: string | null;
      labelName?: string | null;
      /** Retry the failures of an earlier run instead of starting one. */
      retryRun?: ClearOutRunDto | null;
    }): Promise<RunOutcome | null> => {
      if (busy.current || input.ids.length === 0) return null;
      busy.current = true;
      stop.current = false;

      const ids = [...input.ids];
      const outcome: RunOutcome = {
        action: input.action,
        labelName: input.labelName ?? null,
        run: input.retryRun ?? null,
        succeeded: [],
        failed: [],
        skipped: [],
        stoppedBy: null,
        errorMessage: null,
      };
      setProgress({ action: input.action, done: 0, total: ids.length });
      // An action in progress makes the mailbox switcher ask before switching away.
      const endOperation = beginOperation();

      try {
        if (!outcome.run) {
          outcome.run = await api.post<ClearOutRunDto>("/api/clear-out/runs", {
            action: input.action,
            requested: ids.length,
            labelId: input.labelId ?? null,
          });
        }

        const runId = outcome.run.id;
        const size = CHUNK_SIZE[input.action];
        for (let start = 0; start < ids.length; start += size) {
          const batch = ids.slice(start, start + size);
          if (stop.current) {
            outcome.skipped.push(...ids.slice(start));
            outcome.stoppedBy = "user";
            break;
          }
          try {
            const result: ClearOutChunkResponse = await api.post<ClearOutChunkResponse>(`/api/clear-out/runs/${runId}`, {
              ids: batch,
              retry: Boolean(input.retryRun),
            });
            outcome.run = result.run;
            outcome.succeeded.push(...result.succeeded);
            outcome.failed.push(...result.failed);
          } catch (cause) {
            const status = cause instanceof ApiRequestError ? cause.status : 0;
            if (status === 403 || status === 409) {
              // Nothing in this batch was changed; neither will the rest be.
              outcome.skipped.push(...ids.slice(start));
              outcome.stoppedBy = status === 403 ? "permission" : "error";
              outcome.errorMessage = cause instanceof Error ? cause.message : null;
              break;
            }
            // Not confirmed either way: reported as not done, kept for a retry.
            outcome.failed.push(...batch);
            outcome.errorMessage = cause instanceof Error ? cause.message : null;
          }
          setProgress({ action: input.action, done: Math.min(ids.length, start + batch.length), total: ids.length });
        }
      } catch (cause) {
        // The action could not even start.
        const status = cause instanceof ApiRequestError ? cause.status : 0;
        outcome.skipped = ids;
        outcome.stoppedBy = status === 403 ? "permission" : "error";
        outcome.errorMessage = cause instanceof Error ? cause.message : null;
      } finally {
        endOperation();
        busy.current = false;
        setProgress(null);
      }
      return outcome;
    },
    [api, beginOperation],
  );

  return {
    progress,
    running: progress !== null,
    execute,
    requestStop: useCallback(() => {
      stop.current = true;
    }, []),
  };
}
