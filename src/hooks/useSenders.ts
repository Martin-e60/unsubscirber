"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/lib/api/context";
import { SENDER_STATUS, type SenderStatus } from "@/lib/constants";
import type {
  SenderCountsDto,
  SenderDto,
  SenderSort,
  SendersResponse,
} from "@/lib/api/types";

/**
 * The subscription list: fetching, filtering, selecting.
 *
 * Everything the list screen needs, with no rendering decisions in it. A
 * component reads `senders` and calls these functions; how any of it looks is
 * entirely the component's business.
 */

export type SenderFilter = SenderStatus | "ALL";

const emptyCounts: SenderCountsDto = {
  ACTIVE: 0,
  KEPT: 0,
  ROLLED_UP: 0,
  UNSUBSCRIBING: 0,
  UNSUBSCRIBED: 0,
  REQUESTED: 0,
  FAILED: 0,
  MANUAL: 0,
};

export type UseSendersOptions = {
  /** Which tab the list opens on. */
  initialStatus?: SenderFilter;
  /** Pre-filled search term, e.g. from a URL query. */
  initialSearch?: string;
  /** How many rows to request. */
  limit?: number;
  /**
   * Rows per page. When set, the list is paged on the server and `page`,
   * `setPage` and `pageCount` apply; `limit` is then ignored.
   */
  pageSize?: number;
};

export function useSenders(options: UseSendersOptions = {}) {
  const api = useApi();
  const { initialStatus = SENDER_STATUS.ACTIVE, initialSearch = "", limit, pageSize } = options;
  const [senders, setSenders] = useState<SenderDto[]>([]);
  const [counts, setCounts] = useState<SenderCountsDto>(emptyCounts);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<SenderFilter>(initialStatus);
  const [sort, setSort] = useState<SenderSort>("count");
  const [search, setSearch] = useState(initialSearch);
  const debouncedSearch = useDebounced(search, 250);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  // Only the newest request may write to state, so a slow response for an
  // older search or page can never overwrite a newer one.
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, sort });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (pageSize) {
        params.set("limit", String(pageSize));
        params.set("offset", String(page * pageSize));
      } else if (limit) {
        params.set("limit", String(limit));
      }

      const data = await api.get<SendersResponse>(`/api/senders?${params}`);
      if (requestId !== latestRequest.current) return;

      // A decision can empty the last page; step back to the last page that
      // still has rows instead of showing an empty one.
      if (pageSize && page > 0 && data.senders.length === 0 && data.total > 0) {
        setPage(Math.ceil(data.total / pageSize) - 1);
        return;
      }

      setSenders(data.senders);
      setCounts(data.counts);
      setTotal(data.total);
      setError(null);
    } catch (cause) {
      if (requestId !== latestRequest.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load senders");
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [api, status, sort, debouncedSearch, limit, pageSize, page]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Selection is cleared whenever the visible set changes, so you can never
  // act on a sender you can no longer see.
  useEffect(() => {
    setSelected(new Set());
    setPage(0);
  }, [status, sort, debouncedSearch]);

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectableIds = useMemo(
    () => senders.filter((s) => s.canUnsubscribe).map((s) => s.id),
    [senders],
  );

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleAll = useCallback(() => {
    setSelected((current) => {
      const everySelected =
        selectableIds.length > 0 && selectableIds.every((id) => current.has(id));
      return everySelected ? new Set() : new Set(selectableIds);
    });
  }, [selectableIds]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  /** Replaces one row in place, e.g. after an unsubscribe result arrives. */
  const patchSender = useCallback((id: string, patch: Partial<SenderDto>) => {
    setSenders((current) =>
      current.map((sender) => (sender.id === id ? { ...sender, ...patch } : sender)),
    );
  }, []);

  /** "Keep this one" — hides it from the active list without unsubscribing. */
  const keepSender = useCallback(
    async (id: string) => {
      patchSender(id, { status: SENDER_STATUS.KEPT });
      try {
        await api.patch<SenderDto>(`/api/senders/${id}`, {
          status: SENDER_STATUS.KEPT,
        });
        setCounts((c) => ({ ...c, ACTIVE: Math.max(0, c.ACTIVE - 1), KEPT: c.KEPT + 1 }));
        return true;
      } catch (cause) {
        // Another tab may have sent an unsubscribe; reload its real status.
        await refresh();
        setError(cause instanceof Error ? cause.message : "Could not keep sender");
        return false;
      }
    },
    [api, patchSender, refresh],
  );

  /** "Roll up" — bundle this sender into a digest instead of unsubscribing. */
  const rollUpSender = useCallback(
    async (id: string) => {
      patchSender(id, { status: SENDER_STATUS.ROLLED_UP });
      try {
        await api.patch<SenderDto>(`/api/senders/${id}`, {
          status: SENDER_STATUS.ROLLED_UP,
        });
        setCounts((c) => ({
          ...c,
          ACTIVE: Math.max(0, c.ACTIVE - 1),
          ROLLED_UP: c.ROLLED_UP + 1,
        }));
      } catch (cause) {
        await refresh();
        setError(cause instanceof Error ? cause.message : "Could not roll up sender");
      }
    },
    [api, patchSender, refresh],
  );

  /** Undo a "keep", putting the sender back in the active list. */
  const restoreSender = useCallback(
    async (id: string) => {
      patchSender(id, { status: SENDER_STATUS.ACTIVE });
      try {
        await api.patch<SenderDto>(`/api/senders/${id}`, {
          status: SENDER_STATUS.ACTIVE,
        });
        setCounts((c) => ({ ...c, KEPT: Math.max(0, c.KEPT - 1), ACTIVE: c.ACTIVE + 1 }));
        return true;
      } catch (cause) {
        await refresh();
        setError(cause instanceof Error ? cause.message : "Could not restore sender");
        return false;
      }
    },
    [api, patchSender, refresh],
  );

  return {
    senders,
    counts,
    total,
    loading,
    error,
    clearError: () => setError(null),

    page,
    setPage,
    pageSize: pageSize ?? null,
    pageCount: pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1,

    status,
    setStatus,
    sort,
    setSort,
    search,
    setSearch,
    /** The search the current rows were fetched with (search, debounced). */
    appliedSearch: debouncedSearch,

    selected,
    selectedCount: selected.size,
    toggle,
    toggleAll,
    allSelected,
    clearSelection,

    refresh,
    patchSender,
    keepSender,
    rollUpSender,
    restoreSender,
  };
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
