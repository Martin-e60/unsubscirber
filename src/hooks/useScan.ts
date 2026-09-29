"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/api/context";
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
export function useScan(
  options: {
    onFinished?: () => void;
    /**
     * Pick an unfinished scan back up on mount. Home turns this off: it only
     * ever scans when someone presses a button, and shows an unfinished scan
     * as unfinished instead.
     */
    resume?: boolean;
  } = {},
) {
  const resume = options.resume ?? true;
  const api = useApi();
  const [progress, setProgress] = useState<ScanProgressDto | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // False until the last scan has been looked up, so "never scanned" is not
  // confused with "not loaded yet".
  const [loaded, setLoaded] = useState(false);

  // A ref, not state: the loop needs to see cancellation immediately.
  const cancelled = useRef(false);
  // Also a ref: two quick presses must not both get past the check before a
  // re-render, or two scans would race each other.
  const busy = useRef(false);
  const onFinished = useRef(options.onFinished);
  onFinished.current = options.onFinished;

  const runLoop = useCallback(async (scanId: string) => {
    busy.current = true;
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
      busy.current = false;
      setRunning(false);
      onFinished.current?.();
    }
  }, [api]);

  const start = useCallback(
    async (lookbackDays: number) => {
      if (busy.current) return;
      busy.current = true;
      setRunning(true);
      setError(null);
      try {
        const started = await api.post<ScanProgressDto>("/api/scan/start", {
          lookbackDays,
        });
        setProgress(started);
        await runLoop(started.scanId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not start scan");
        busy.current = false;
        setRunning(false);
      }
    },
    [api, runLoop],
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
        if (!active) return;
        if (existing) {
          setProgress(existing);
          if (resume && existing.status === "RUNNING") void runLoop(existing.scanId);
        }
      } catch {
        // A missing mailbox is normal before the first connect.
      } finally {
        if (active) setLoaded(true);
      }
    })();

    return () => {
      active = false;
      cancelled.current = true;
    };
  }, [api, runLoop, resume]);

  return { progress, running, error, loaded, start, cancel };
}
