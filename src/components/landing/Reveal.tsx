"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./Reveal.module.css";

/**
 * Fades a section up once, the first time it scrolls into view.
 *
 * Built so that nothing can end up hidden:
 *   - the server renders everything visible;
 *   - only an element that starts *below* the fold is ever hidden, so nothing
 *     already on screen blinks out and back in;
 *   - reduced motion, no IntersectionObserver or no JavaScript at all simply
 *     leave the content where it is.
 *
 * Once revealed it stays revealed — scrolling back up does not replay it.
 */

type State = "idle" | "pending" | "in";

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  /** Milliseconds, for staggering siblings. */
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section" | "article";
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Already on screen (a short page, a deep link to #how-it-works): leave it.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    setState("pending");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState("in");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // The union of intrinsic elements makes the ref type awkward; all four
      // are HTMLElements, which is all the effect above needs.
      ref={ref as never}
      className={[styles.reveal, className].filter(Boolean).join(" ")}
      data-reveal={state}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
