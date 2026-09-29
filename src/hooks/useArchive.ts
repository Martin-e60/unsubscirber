"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/api/context";
import type { ArchiveItemDto, UnsubscribedResponse } from "@/lib/api/types";

/**
 * The Unsubscribed archive: searching, loading more, and refreshing after a
 * check — with no rendering decisions in it.
 */

export function useArchive(options: { pageSize?: number } = {}) {
  const api = useApi();
  const pageSize = options.pageSize ?? 10;

  const [data, setData] = useState<Omit<UnsubscribedResponse, "items"> | null>(null);
  const [items, setItems] = useState<ArchiveItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Only the newest request may write, so a slow answer for an old search
  // cannot replace a newer one.
  const latest = useRef(0);
  const loaded = useRef(0);
  loaded.current = items.length;

  const fetchPage = useCallback(
    (offset: number, limit: number) => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (appliedSearch) params.set("search", appliedSearch);
      return api.get<UnsubscribedResponse>(`/api/unsubscribed?${params}`);
    },
    [api, appliedSearch],
  );

  /** Reloads everything currently shown, e.g. after a check. */
  const refresh = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    try {
      const limit = Math.min(100, Math.max(pageSize, loaded.current));
      const { items: next, ...rest } = await fetchPage(0, limit);
      if (id !== latest.current) return;
      setItems(next);
      setData(rest);
      setError(null);
    } catch (cause) {
      if (id !== latest.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load your unsubscribes");
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [fetchPage, pageSize]);

  // A new search starts again from the top.
  useEffect(() => {
    loaded.current = 0;
    void refresh();
  }, [appliedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    const id = latest.current;
    setLoadingMore(true);
    try {
      const { items: next, ...rest } = await fetchPage(loaded.current, pageSize);
      if (id !== latest.current) return;
      setItems((current) => {
        const known = new Set(current.map((item) => item.senderId));
        return [...current, ...next.filter((item) => !known.has(item.senderId))];
      });
      setData(rest);
      setError(null);
    } catch (cause) {
      if (id !== latest.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load more");
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, pageSize]);

  return {
    items,
    total: data?.total ?? 0,
    archiveTotal: data?.archiveTotal ?? 0,
    lastCheck: data?.lastCheck ?? null,
    checkLookbackDays: data?.checkLookbackDays ?? null,
    loaded: data !== null,
    loading,
    loadingMore,
    error,
    search,
    setSearch,
    appliedSearch,
    hasMore: data !== null && items.length < data.total,
    refresh,
    loadMore,
  };
}
