"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that eases to its new value when — and only when — it changes.
 *
 * The first value is shown as it is: nothing counts up from zero on page
 * load, because that would be animation for its own sake. Reduced motion
 * skips the easing entirely.
 */
export function useCountTo(target: number | null, duration = 480): number | null {
  const [shown, setShown] = useState(target);
  const previous = useRef(target);

  useEffect(() => {
    const from = previous.current;
    previous.current = target;

    if (target === null || from === null || from === target) {
      setShown(target);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (target - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return shown;
}
