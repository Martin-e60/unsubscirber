"use client";

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { SENDER_STATUS } from "@/lib/constants";
import type { SenderDto, UnsubscribeResultDto } from "@/lib/api/types";

/**
 * Runs unsubscribes.
 *
 * Requests go out a few at a time rather than all at once: unsubscribe
 * endpoints belong to strangers and some take many seconds, so a small amount
 * of parallelism keeps the queue moving while each row still updates the
 * instant its own request comes back.
 */

const PARALLEL = 3;

export function useUnsubscribe(options: {
  onResult: (id: string, patch: Partial<SenderDto>) => void;
}) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<UnsubscribeResultDto[]>([]);
  const [running, setRunning] = useState(false);

  const onResult = useRef(options.onResult);
  onResult.current = options.onResult;

  const run = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return [];

    setRunning(true);
    setResults([]);
    setPending(new Set(ids));

    const collected: UnsubscribeResultDto[] = [];
    let cursor = 0;

    const workers = Array.from({ length: Math.min(PARALLEL, ids.length) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= ids.length) return;

        const senderId = ids[index];
        onResult.current(senderId, { status: SENDER_STATUS.UNSUBSCRIBING });

        try {
          const result = await api.post<UnsubscribeResultDto>("/api/unsubscribe", {
            senderId,
          });
          collected.push(result);
          setResults((current) => [...current, result]);
          onResult.current(senderId, {
            status: result.status,
            manualUrl: result.manualUrl,
          });
        } catch (cause) {
          const failure: UnsubscribeResultDto = {
            senderId,
            status: SENDER_STATUS.FAILED,
            method: null,
            manualUrl: null,
            detail: cause instanceof Error ? cause.message : "Request failed",
          };
          collected.push(failure);
          setResults((current) => [...current, failure]);
          onResult.current(senderId, { status: SENDER_STATUS.FAILED });
        } finally {
          setPending((current) => {
            const next = new Set(current);
            next.delete(senderId);
            return next;
          });
        }
      }
    });

    await Promise.all(workers);
    setRunning(false);
    return collected;
  }, []);

  const summary = {
    unsubscribed: results.filter((r) => r.status === SENDER_STATUS.UNSUBSCRIBED).length,
    manual: results.filter((r) => r.status === SENDER_STATUS.MANUAL).length,
    failed: results.filter((r) => r.status === SENDER_STATUS.FAILED).length,
  };

  const reset = useCallback(() => setResults([]), []);

  return { run, pending, results, running, summary, reset };
}
