"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Progress, 0 to 1, of an entrance animation that plays once per mount.
 *
 * It waits for `ready` — real data, so a missing figure is never animated as
 * if it were zero — then runs for `duration` and stays at 1. A rerender, or
 * data that changes afterwards, does not start it again; a fresh mount (opening
 * Home again) does. Linear on purpose: every graphic and number driven by the
 * same value starts together and finishes together.
 *
 * Reduced motion skips straight to 1.
 */
export function useEntrance(ready: boolean, duration = 2000): number {
  const [progress, setProgress] = useState(0);
  // Kept in refs so React's development double-run of effects continues the
  // same animation instead of starting a second one.
  const startedAt = useRef<number | null>(null);
  const finished = useRef(false);

  useEffect(() => {
    if (!ready || finished.current) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finished.current = true;
      setProgress(1);
      return;
    }

    let frame = 0;
    const tick = (now: number) => {
      if (startedAt.current === null) startedAt.current = now;
      const t = Math.min(1, (now - startedAt.current) / duration);
      setProgress(t);
      if (t < 1) frame = requestAnimationFrame(tick);
      else finished.current = true;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready, duration]);

  return progress;
}
