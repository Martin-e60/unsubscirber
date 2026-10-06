"use client";

import { useEffect, useId, useRef } from "react";
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

/**
 * One envelope, drawn as folded paper in a 400 × 152 box (the ASPECT the
 * engine sizes it by): a back sheet showing its edge, a flap folded in from
 * the left with a crease across it, the bright front panel the text sits on,
 * a small facet under its lower right corner and a curled-over top corner.
 * Each facet has its own light-to-shade gradient, so the folds read from
 * light rather than from outlines alone.
 */
function Envelope({ side, sample }: { side: Side; sample?: Sample }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const g = (name: string) => `${name}-${id}`;
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
        <svg
          className={styles.folds}
          viewBox="0 0 400 152"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id={g("back")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className={styles.stopBackHi} />
              <stop offset="1" className={styles.stopBackLo} />
            </linearGradient>
            <linearGradient id={g("flap")} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" className={styles.stopFlapHi} />
              <stop offset="1" className={styles.stopFlapLo} />
            </linearGradient>
            <linearGradient id={g("front")} x1="0" y1="0" x2="0.35" y2="1">
              <stop offset="0" className={styles.stopFrontHi} />
              <stop offset="1" className={styles.stopFrontLo} />
            </linearGradient>
            <linearGradient id={g("facet")} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0" className={styles.stopFacetHi} />
              <stop offset="1" className={styles.stopFacetLo} />
            </linearGradient>
            <linearGradient id={g("ear")} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" className={styles.stopEarLo} />
              <stop offset="0.6" className={styles.stopEarHi} />
            </linearGradient>
          </defs>
          {/* The thickness of the sheet, showing under its lower edge. */}
          <path className={styles.edge} d="M1 4 H368 L401 37 V155 H1 Z" />
          {/* The back sheet: seen in the pocket at lower left. */}
          <path className={styles.facet} fill={`url(#${g("back")})`} d="M0 0 H366 L400 32 V152 H0 Z" />
          {/* The lower right facet, folded up under the front panel. */}
          <path className={styles.facet} fill={`url(#${g("facet")})`} d="M352 152 L400 100 V152 Z" />
          {/* The front panel the address sits on. */}
          <path
            className={styles.facet}
            fill={`url(#${g("front")})`}
            d="M0 0 H366 L400 32 V100 L352 152 H132 L102 108 Z"
          />
          {/* The flap folded in from the left, with the pocket crease. */}
          <path className={styles.facet} fill={`url(#${g("flap")})`} d="M0 0 L102 108 L0 140 Z" />
          <path className={styles.crease} d="M0 122 L70 104" />
          {/* The top right corner, curled over towards the viewer. */}
          <path className={styles.earShadow} d="M366 0 L400 32 L398 40 L362 6 Z" />
          <path className={styles.facet} fill={`url(#${g("ear")})`} d="M366 0 Q380 6 400 32 L384 29 Q373 17 366 0 Z" />
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
