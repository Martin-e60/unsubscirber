"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { StatsDto } from "@/lib/api/types";

/** The Home screen's headline numbers. */
export function useStats() {
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setStats(await api.get<StatsDto>("/api/stats"));
    } catch {
      // A mailbox that isn't connected yet simply has no stats.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { stats, loading, refresh };
}
