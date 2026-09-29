"use client";

import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/lib/api/context";
import type { HistoryItemDto } from "@/lib/api/types";

/**
 * Every unsubscribe attempt, newest first — the raw material for the Home
 * screen's Recent activity. Works the same against the real API and the demo.
 */
export function useHistory() {
  const api = useApi();
  const [items, setItems] = useState<HistoryItemDto[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await api.get<HistoryItemDto[]>("/api/history"));
    } catch {
      // No mailbox yet, or a transient failure: show no activity, not an error.
      setItems([]);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, refresh };
}
