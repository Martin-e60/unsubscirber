"use client";

import { useId, useMemo } from "react";
import { useCountTo } from "@/hooks/useCountTo";
import { useEntrance } from "@/hooks/useEntrance";
import { formatEstimate, formatMinutes, formatMinutesCounting } from "@/lib/home/format";
import { trendPath } from "@/lib/home/trend";
import type { StatsDto, TrendPoint } from "@/lib/api/types";
import styles from "./Impact.module.css";

/**
 * The impact cards: three figures, all derived from confirmed removals only.
 *
 * The first is a count of real events. The other two are estimates — how
 * often those senders wrote before, and what that mail cost at five seconds
 * an email — so they are read aloud as "about", and the caption says what they
 * are based on. Requests still waiting, attempts that need a click, and
 * failures never feed them.
 *
 * The ring and the bar are decoration that comes with the figures: neither is
 * a percentage, a goal or one segment per removal. The line is the one graphic
 * that carries data — how the monthly estimate built up as removals were
 * confirmed — and is drawn only when there is a history to draw.
 *
 * On each opening of Home, once its figures are loaded, the numbers count up
 * from zero and the three graphics draw, all driven by one clock for the same
 * two seconds. A figure that is not available is shown as "—", never as zero.
 */

/** The trend's drawing box; the SVG stretches to fill its card. */
const TREND_WIDTH = 400;
const TREND_HEIGHT = 80;

const RING_RADIUS = 45;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const RING_GAP = 19;
const RING_DASH = RING_LENGTH / 3 - RING_GAP;

function Figure({
  label,
  text,
  final,
  about = false,
}: {
  label: string;
  /** What is on screen right now: a count part-way up, or the final text. */
  text: string;
  /** What it settles at; reserves its width so nothing moves while counting. */
  final: string;
  about?: boolean;
}) {
  const missing = final === "—";

  // Read aloud as "about 19, Fewer emails / month" — the settled figure only,
  // never the count in between.
  return (
    <div className={styles.copy}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>
        {missing ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="srOnly">Not available yet:</span>
          </>
        ) : (
          <>
            <span className="srOnly">
              {about ? "about " : ""}
              {final}
            </span>
            <span className={styles.ghost} aria-hidden="true">
              {final}
            </span>
            <span className={styles.live} aria-hidden="true">
              {text}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

/** Three rounded arcs that draw clockwise from the top. */
function Ring({ progress, drawn }: { progress: number; drawn: boolean }) {
  const mask = useId();
  const reveal = drawn ? progress * RING_LENGTH : 0;

  return (
    <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <circle
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            stroke="#fff"
            strokeWidth="16"
            strokeDasharray={`${reveal} ${RING_LENGTH}`}
            transform="rotate(-90 50 50)"
          />
        </mask>
      </defs>
      <g mask={drawn ? `url(#${mask})` : undefined}>
        <circle
          className={drawn ? styles.arcs : styles.arcsIdle}
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${RING_DASH} ${RING_GAP}`}
          strokeDashoffset={-RING_GAP / 2}
          transform="rotate(-90 50 50)"
        />
      </g>
    </svg>
  );
}

function Trend({ points, progress }: { points: TrendPoint[]; progress: number }) {
  const gradient = useId();
  const path = useMemo(() => trendPath(points, TREND_WIDTH, TREND_HEIGHT), [points]);
  if (!path) return null;

  const first = new Date(points[0].at).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <svg
      className={styles.trend}
      viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`How the estimate built up from ${first} to today`}
      style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d3d3d8" />
          <stop offset="1" stopColor="#d3d3d8" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gradient})`} opacity={progress} />
      <path
        className={styles.trendLine}
        d={path.line}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Impact({ stats }: { stats: StatsDto | null }) {
  const progress = useEntrance(stats !== null);

  // Once the entrance is over, later changes (a scan, a removal) ease as they
  // always did; during it, the entrance owns the numbers.
  const confirmed = useCountTo(stats?.confirmedUnsubscribes ?? null);
  const fewer = useCountTo(stats?.fewerEmailsPerMonth ?? null);
  const saved = useCountTo(stats?.timeSavedPerMonthSeconds ?? null);

  const done = progress >= 1;
  const confirmedTarget = stats?.confirmedUnsubscribes ?? null;
  const fewerTarget = stats?.fewerEmailsPerMonth ?? null;
  const savedTarget = stats?.timeSavedPerMonthSeconds ?? null;

  const count = (n: number) => Math.round(n).toLocaleString("en");
  // Counting towards the figure as shown, rounded down, so it arrives exactly
  // when the two seconds end and not a frame before.
  const countUp = (target: number, p: number) => Math.floor(Math.round(target) * p).toLocaleString("en");

  const confirmedFinal = confirmed === null ? "—" : count(confirmed);
  const fewerFinal = fewer === null ? "—" : formatEstimate(fewer);
  const savedFinal = saved === null ? "—" : formatMinutes(saved);

  const confirmedNow =
    done || confirmedTarget === null ? confirmedFinal : countUp(confirmedTarget, progress);
  const fewerNow = done || fewerTarget === null ? fewerFinal : countUp(fewerTarget, progress);
  const savedNow =
    done || savedTarget === null ? savedFinal : formatMinutesCounting(savedTarget, progress);

  const trend = stats?.fewerEmailsTrend ?? [];
  const hasSaved = savedTarget !== null && savedTarget > 0;

  return (
    <section className={styles.impact} aria-labelledby="impact-title">
      <h2 className="srOnly" id="impact-title">
        Your impact
      </h2>

      <ul className={styles.cards} aria-busy={stats === null}>
        <li className={`${styles.card} ${styles.withRing}`}>
          {stats === null ? null : (
            <Ring progress={progress} drawn={(confirmedTarget ?? 0) > 0} />
          )}
          <Figure label="Subscriptions removed" text={confirmedNow} final={confirmedFinal} />
        </li>

        <li className={styles.card}>
          <Figure label="Fewer emails / month" text={fewerNow} final={fewerFinal} about />
          {stats === null ? null : <Trend points={trend} progress={progress} />}
        </li>

        <li className={styles.card}>
          <Figure label="Time saved / month" text={savedNow} final={savedFinal} about />
          <div className={styles.track} aria-hidden="true">
            {hasSaved ? (
              <span
                className={styles.bar}
                style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}
              />
            ) : null}
          </div>
        </li>
      </ul>

      <p className={styles.basis}>Based on confirmed removals</p>
    </section>
  );
}
