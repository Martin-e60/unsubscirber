"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
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
};

export function useSenders(options: UseSendersOptions = {}) {
  const { initialStatus = SENDER_STATUS.ACTIVE, initialSearch = "", limit } = options;
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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, sort });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (limit) params.set("limit", String(limit));

      const data = await api.get<SendersResponse>(`/api/senders?${params}`);
      setSenders(data.senders);
      setCounts(data.counts);
      setTotal(data.total);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load senders");
    } finally {
      setLoading(false);
    }
  }, [status, sort, debouncedSearch, limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Selection is cleared whenever the visible set changes, so you can never
  // act on a sender you can no longer see.
  useEffect(() => {
    setSelected(new Set());
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
      } catch (cause) {
        // Roll the optimistic update back if the server disagreed.
        patchSender(id, { status: SENDER_STATUS.ACTIVE });
        setError(cause instanceof Error ? cause.message : "Could not keep sender");
      }
    },
    [patchSender],
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
        patchSender(id, { status: SENDER_STATUS.ACTIVE });
        setError(cause instanceof Error ? cause.message : "Could not roll up sender");
      }
    },
    [patchSender],
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
      } catch (cause) {
        patchSender(id, { status: SENDER_STATUS.KEPT });
        setError(cause instanceof Error ? cause.message : "Could not restore sender");
      }
    },
    [patchSender],
  );

  return {
    senders,
    counts,
    total,
    loading,
    error,

    status,
    setStatus,
    sort,
    setSort,
    search,
    setSearch,

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
