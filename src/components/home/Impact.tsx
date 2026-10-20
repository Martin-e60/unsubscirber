"use client";

import { useId, useMemo } from "react";
import { useCountTo } from "@/hooks/useCountTo";
import { useEntrance } from "@/hooks/useEntrance";
import { formatEstimate, formatMinutes, formatMinutesCounting } from "@/lib/home/format";
import { rulerEnd } from "@/lib/home/ruler";
import { trendPath } from "@/lib/home/trend";
import type { StatsDto, TrendPoint } from "@/lib/api/types";
import styles from "./Impact.module.css";
import glass from "./glass.module.css";

/**
 * The impact cards: three figures, all derived from confirmed removals only.
 *
 * The first is a count of real events. The other two are estimates — how
 * often those senders wrote before, and what that mail cost at five seconds
 * an email — so they are read aloud as "about", and the caption says what they
 * are based on. Requests still waiting, attempts that need a click, and
 * failures never feed them.
 *
 * Each graphic follows its figure. The ring fills with the share of the senders
 * found that were removed. The line shows how the monthly estimate built up as
 * removals were confirmed, and is drawn only when there is a history to draw.
 * The bar is a ruler with no fixed end: it runs to the next round step above
 * the time saved (see `rulerEnd`), and when the figure outgrows that step the
 * end moves on and the bar shortens to fit the new one.
 *
 * On each opening of Home, once its figures are loaded, the numbers count up
 * from zero and the three graphics draw, all driven by one clock for the same
 * two seconds; the ring and the bar fill as far as the number has counted. A
 * figure that is not available is shown as "—", never as zero.
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

/**
 * Three rounded arcs. The light ones are always there; the dark fill runs over
 * them clockwise from the top, `fraction` of the way round the arcs, and ends
 * in a round cap part-way into an arc where the share falls there.
 */
function Ring({ fraction }: { fraction: number }) {
  let left = Math.min(Math.max(fraction, 0), 1) * 3 * RING_DASH;

  const fills = Array.from({ length: 3 }, () => {
    const length = Math.min(left, RING_DASH);
    left -= length;
    return length;
  });

  return (
    <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle
        className={styles.arcsIdle}
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
      {fills.map((length, arc) =>
        length > 0 ? (
          <circle
            key={arc}
            className={styles.arcs}
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${length} ${RING_LENGTH}`}
            strokeDashoffset={-(arc * (RING_DASH + RING_GAP) + RING_GAP / 2)}
            transform="rotate(-90 50 50)"
          />
        ) : null,
      )}
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

  // The ruler's end follows the figure it settles at, never the count on the
  // way there, so it does not jump while the numbers climb. When a later change
  // moves it to the next step it eases over, together with the figure, and the
  // bar shortens with it.
  const rulerTarget = savedTarget === null ? null : rulerEnd(savedTarget);
  const rulerShown = useCountTo(rulerTarget);

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

  // How far each figure has counted: the ring and the bar fill as far as the
  // number on screen. They follow it continuously rather than in the whole
  // steps the digits take, and arrive at the real share when the count does.
  const counted = done ? 1 : progress;
  const found = stats?.totalSenders ?? 0;
  const ringFraction = found > 0 && confirmed !== null ? (confirmed * counted) / found : 0;
  const rulerFraction =
    saved !== null && rulerTarget !== null
      ? (saved * counted) / (rulerShown ?? rulerTarget)
      : 0;

  return (
    <section className={styles.impact} aria-labelledby="impact-title">
      <h2 className="srOnly" id="impact-title">
        Your impact
      </h2>

      <ul className={styles.cards} aria-busy={stats === null}>
        <li className={`${styles.card} ${styles.withRing} ${glass.card}`}>
          {stats === null ? null : <Ring fraction={ringFraction} />}
          <Figure label="Subscriptions removed" text={confirmedNow} final={confirmedFinal} />
        </li>

        <li className={`${styles.card} ${glass.card}`}>
          <Figure label="Fewer emails / month" text={fewerNow} final={fewerFinal} about />
          {stats === null ? null : <Trend points={trend} progress={progress} />}
        </li>

        <li className={`${styles.card} ${glass.card}`}>
          <Figure label="Time saved / month" text={savedNow} final={savedFinal} about />
          <div className={styles.ruler} aria-hidden="true">
            <div className={styles.track}>
              {rulerTarget === null ? null : (
                <span
                  className={styles.bar}
                  style={{ inlineSize: `${Math.min(Math.max(rulerFraction, 0), 1) * 100}%` }}
                />
              )}
            </div>
            {rulerTarget === null ? null : (
              <>
                <div className={styles.ticks}>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className={styles.scale}>
                  <span>0</span>
                  <span>{formatMinutes(rulerTarget)}</span>
                </div>
              </>
            )}
          </div>
        </li>
      </ul>

      <p className={styles.basis}> 
      </p>
    </section>
  );
}
