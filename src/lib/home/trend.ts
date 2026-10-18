import type { TrendPoint } from "@/lib/api/types";

/**
 * The drawing of Home's trend line: a running total as a smooth curve and the
 * area under it, in a box of the given size.
 *
 * Time runs along x, from the first point to the last, so a gap of weeks looks
 * like one. Height is scaled between the first value and the last (the line is
 * a shape, not an axis), and a series that never changes sits mid-height. The
 * curve is a monotone cubic through the points: it cannot overshoot, so a
 * running total never appears to dip between two points.
 */

export type TrendPath = { line: string; area: string };

type Xy = { x: number; y: number };

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Fritsch–Carlson tangents: the slope at each point that keeps it monotone. */
function tangents(points: Xy[]): number[] {
  const n = points.length;
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    slope.push((points[i + 1].y - points[i].y) / (points[i + 1].x - points[i].x));
  }

  const tangent = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tangent.push(slope[n - 2]);

  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const size = Math.hypot(a, b);
    if (size > 3) {
      tangent[i] = (3 * a * slope[i]) / size;
      tangent[i + 1] = (3 * b * slope[i]) / size;
    }
  }
  return tangent;
}

/**
 * Null when there is nothing to draw: fewer than two distinct moments, or a
 * series that runs backwards in time.
 */
export function trendPath(
  trend: TrendPoint[],
  width: number,
  height: number,
  inset = 3,
): TrendPath | null {
  const byTime = new Map<number, number>();
  for (const point of trend) {
    const at = Date.parse(point.at);
    if (!Number.isFinite(at) || !Number.isFinite(point.value)) return null;
    byTime.set(at, point.value);
  }
  if (byTime.size < 2) return null;

  const sorted = [...byTime].sort((a, b) => a[0] - b[0]);
  const t0 = sorted[0][0];
  const span = sorted[sorted.length - 1][0] - t0;
  const low = sorted[0][1];
  const range = sorted[sorted.length - 1][1] - low;
  const usable = height - 2 * inset;

  const points: Xy[] = sorted.map(([at, value]) => ({
    x: ((at - t0) / span) * width,
    y: range > 0 ? inset + (1 - (value - low) / range) * usable : height / 2,
  }));

  const tangent = tangents(points);
  let line = `M${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = (points[i + 1].x - points[i].x) / 3;
    line +=
      ` C${round(points[i].x + dx)} ${round(points[i].y + tangent[i] * dx)}` +
      ` ${round(points[i + 1].x - dx)} ${round(points[i + 1].y - tangent[i + 1] * dx)}` +
      ` ${round(points[i + 1].x)} ${round(points[i + 1].y)}`;
  }

  const last = points[points.length - 1];
  const area = `${line} L${round(last.x)} ${height} L${round(points[0].x)} ${height} Z`;
  return { line, area };
}
