"use client";

import { useEffect, useRef } from "react";
import { OPENING, POOL_PER_SIDE, startHeroStreams, type Sample, type Side } from "./streamsEngine";
import styles from "./HeroStreams.module.css";

/**
 * The two envelope lanes beside the hero copy, and the dust they turn into.
 *
 * Folded paper envelopes rise in a lane on each side. Hovering, focusing or
 * tapping one holds it and reveals its Unsubscribe control; using that
 * dissolves the envelope into dust that drifts into the Try the demo button.
 * It is an illustration: invented senders, no requests, no navigation. The
 * motion lives in ./streamsEngine.ts.
 *
 * Renders into the hero section (marked data-hero), which supplies the copy
 * (data-hero-copy) and the CTA (data-hero-cta) the engine measures. Envelopes
 * start hidden and inert, so if the script never runs the copy and the real
 * CTA are all there is. The changing sample text is never a live region.
 */
export function HeroStreams() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const streams = ref.current;
    const root = streams?.closest<HTMLElement>("[data-hero]");
    if (!streams || !root) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = () => {
      try {
        return startHeroStreams(root, !motion.matches);
      } catch {
        // The copy and the CTA do not depend on the illustration.
        return () => {};
      }
    };
    let stop = start();
    const restart = () => {
      stop();
      stop = start();
    };
    motion.addEventListener("change", restart);
    return () => {
      motion.removeEventListener("change", restart);
      stop();
    };
  }, []);

  return (
    <>
      <div className={styles.streams} ref={ref} data-streams>
        <canvas className={styles.motes} data-motes aria-hidden="true" />
        {(["left", "right"] as const).map((side) => (
          <ul
            key={side}
            className={styles.lane}
            aria-label={side === "left" ? "Sample subscriptions" : "More sample subscriptions"}
          >
            {Array.from({ length: POOL_PER_SIDE }, (_, i) => (
              <Envelope key={i} side={side} sample={OPENING[side][i]} />
            ))}
          </ul>
        ))}
      </div>
      <canvas className={styles.dust} data-dust aria-hidden="true" />
    </>
  );
}

function Envelope({ side, sample }: { side: Side; sample?: Sample }) {
  return (
    <li
      className={styles.env}
      data-env
      data-side={side}
      inert
      style={{ visibility: "hidden", opacity: 0 }}
    >
      <span className={styles.shade} data-shade aria-hidden="true" />
      <div className={styles.paper} data-paper>
        {/* The folds: a deep flap from the left, a shallow one on the right. */}
        <svg
          className={styles.folds}
          viewBox="0 0 400 152"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path className={styles.flap} d="M0 0 L108 82 L0 152" />
          <path className={styles.flapSide} d="M400 34 L338 98 L400 152" />
          <path className={styles.crease} d="M108 82 L170 152" />
        </svg>
        <span className={styles.text}>
          <span className={styles.sender} data-sender>
            {sample?.sender}
          </span>
          <span className={styles.subject} data-subject>
            {sample?.subject}
          </span>
        </span>
        <span className={styles.time} data-time>
          {sample?.time}
        </span>
        <button
          type="button"
          className={styles.unsub}
          data-unsub
          aria-label={sample ? `Unsubscribe from ${sample.sender} (sample)` : "Unsubscribe (sample)"}
        >
          Unsubscribe
        </button>
      </div>
    </li>
  );
}
