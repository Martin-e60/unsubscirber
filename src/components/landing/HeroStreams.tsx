"use client";

import { useEffect, useId, useRef } from "react";
import { OPENING, POOL_PER_SIDE, startHeroStreams, type Sample, type Side } from "./streamsEngine";
import styles from "./HeroStreams.module.css";

/**
 * The two curved envelope lanes beside the hero copy, their reflections in the
 * glass, and the dust they turn into.
 *
 * Folded paper envelopes rise along a lane on each side, shaped ( ) — each
 * bowing outward at mid-height. Hovering, focusing or tapping one holds it and
 * reveals its Unsubscribe control; using that dissolves the envelope into dust
 * that drifts into the Try the demo button. It is an illustration: invented
 * senders, no requests, no navigation. The motion lives in ./streamsEngine.ts.
 *
 * Renders into the hero section (marked data-hero), which supplies the copy
 * (data-hero-copy), the CTA (data-hero-cta), the hint (data-hero-hint) and the
 * glass (data-glass) the engine measures or moves. Envelopes start hidden and
 * inert, so if the script never runs the copy and the real CTA are all there
 * is. The changing sample text is never a live region.
 */

export function HeroStreams() {
  const ref = useRef<HTMLDivElement>(null);
  const art = useId().replace(/[^a-zA-Z0-9_-]/g, "");

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
        <PaperArt id={art} />
        {/* What the glass reflects: a faint mirror of each envelope near it, and
            the soft highlight it casts as it passes. Driven by the same
            envelopes, one pair each. */}
        {(["left", "right"] as const).map((side) => (
          <div key={side} className={styles.mirrors} data-mirrors data-side={side} aria-hidden="true">
            {Array.from({ length: POOL_PER_SIDE }, (_, i) => (
              <Reflection key={i} art={art} />
            ))}
          </div>
        ))}
        <canvas className={styles.motes} data-motes aria-hidden="true" />
        {(["left", "right"] as const).map((side) => (
          <ul
            key={side}
            className={styles.lane}
            aria-label={side === "left" ? "Sample subscriptions" : "More sample subscriptions"}
          >
            {Array.from({ length: POOL_PER_SIDE }, (_, i) => (
              <Envelope key={i} art={art} side={side} sample={OPENING[side][i]} />
            ))}
          </ul>
        ))}
      </div>
      <canvas className={styles.dust} data-dust aria-hidden="true" />
    </>
  );
}

/**
 * The folded paper, drawn once for every envelope and reflection to <use>.
 *
 * It lives in a 400 × 152 box (the ASPECT the engine sizes envelopes by): a
 * back sheet showing its edge, a flap folded in from the left with a crease
 * across it, the bright front panel the text sits on, a small facet under its
 * lower right corner and a curled-over top corner. Each facet has its own
 * light-to-shade gradient, so the folds read from light rather than from
 * outlines alone. Everything is vector, so it stays sharp at any size and angle.
 */
function PaperArt({ id }: { id: string }) {
  const g = (name: string) => `${name}-${id}`;
  return (
    <svg className={styles.art} width="0" height="0" aria-hidden="true" focusable="false">
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
        <g id={g("paper")}>
          {/* The thickness of the sheet, showing under its lower edge. */}
          <path className={styles.edge} d="M1 5 H368 L401 38 V157 H1 Z" />
          {/* The back sheet: seen in the pocket at lower left. */}
          <path className={styles.facet} fill={`url(#${g("back")})`} d="M0 0 H366 L400 32 V152 H0 Z" />
          {/* The lower right facet, folded up under the front panel. */}
          <path className={styles.facet} fill={`url(#${g("facet")})`} d="M352 152 L400 100 V152 Z" />
          {/* The pocket's lower sliver, under the crease. */}
          <path className={styles.facet} fill={`url(#${g("back")})`} d="M0 152 L70 108 L97 152 Z" />
          {/* The front panel the address sits on. */}
          <path
            className={styles.facet}
            fill={`url(#${g("front")})`}
            d="M0 0 H366 L400 32 V100 L352 152 H97 Z"
          />
          {/* The flap folded in from the left, with the pocket crease. */}
          <path className={styles.facet} fill={`url(#${g("flap")})`} d="M0 0 L70 108 L0 152 Z" />
          {/* The top right corner, curled over towards the viewer. */}
          <path className={styles.earShadow} d="M366 0 L400 32 L398 40 L362 6 Z" />
          <path className={styles.facet} fill={`url(#${g("ear")})`} d="M366 0 Q380 6 400 32 L384 29 Q373 17 366 0 Z" />
        </g>
      </defs>
    </svg>
  );
}

/**
 * One envelope: the shared paper, the sender, subject and time printed on it,
 * and its Unsubscribe control. The shadow is a separate layer, so it can fade
 * with the dissolve instead of being cut off by its mask.
 */
function Envelope({ art, side, sample }: { art: string; side: Side; sample?: Sample }) {
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
          <use href={`#paper-${art}`} />
        </svg>
        <span className={styles.text}>
          <span className={styles.sender} data-sender>
            {sample?.sender}
          </span>
          <span className={styles.time} data-time>
            {sample?.time}
          </span>
          <span className={styles.subject} data-subject>
            {sample?.subject}
          </span>
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

/**
 * An envelope's reflection: the same paper, mirrored, with only the shape of
 * its lines (no readable text), and a soft highlight beside it. The engine
 * places both from the envelope's actual pose and fades them with it.
 */
function Reflection({ art }: { art: string }) {
  return (
    <>
      <span className={styles.glow} data-glow />
      <span className={styles.mirror} data-mirror>
        <svg className={styles.folds} viewBox="0 0 400 152" preserveAspectRatio="none" focusable="false">
          <use href={`#paper-${art}`} />
          <rect className={styles.line} x="112" y="31" width="132" height="12" rx="6" />
          <rect className={styles.line} x="112" y="54" width="104" height="7" rx="3.5" />
        </svg>
      </span>
    </>
  );
}
