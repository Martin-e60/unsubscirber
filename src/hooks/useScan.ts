"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { ScanProgressDto } from "@/lib/api/types";

/**
 * Drives a mailbox scan from the browser.
 *
 * The server processes one page per request, so this hook is the loop: start,
 * then keep calling /api/scan/step until the server says it is done. That is
 * what gives an honest progress bar and keeps every request short.
 *
 * If a scan was left running when the tab closed, `resume` picks it back up on
 * the next page load.
 */
export function useScan(options: { onFinished?: () => void } = {}) {
  const [progress, setProgress] = useState<ScanProgressDto | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A ref, not state: the loop needs to see cancellation immediately.
  const cancelled = useRef(false);
  const onFinished = useRef(options.onFinished);
  onFinished.current = options.onFinished;

  const runLoop = useCallback(async (scanId: string) => {
    setRunning(true);
    cancelled.current = false;

    try {
      // Hard ceiling so a provider bug can never spin forever.
      for (let step = 0; step < 2000; step++) {
        if (cancelled.current) break;

        const next = await api.post<ScanProgressDto>("/api/scan/step", { scanId });
        setProgress(next);

        if (next.error) setError(next.error);
        if (next.done) break;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Scan failed");
    } finally {
      setRunning(false);
      onFinished.current?.();
    }
  }, []);

  const start = useCallback(
    async (lookbackDays: number) => {
      setError(null);
      try {
        const started = await api.post<ScanProgressDto>("/api/scan/start", {
          lookbackDays,
        });
        setProgress(started);
        await runLoop(started.scanId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not start scan");
        setRunning(false);
      }
    },
    [runLoop],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);

  // On mount: load the last scan, and resume it if it was still going.
  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const existing = await api.get<ScanProgressDto | null>("/api/scan");
        if (!active || !existing) return;
        setProgress(existing);
        if (existing.status === "RUNNING") void runLoop(existing.scanId);
      } catch {
        // A missing mailbox is normal before the first connect.
      }
    })();

    return () => {
      active = false;
      cancelled.current = true;
    };
  }, [runLoop]);

  return { progress, running, error, start, cancel };
}
