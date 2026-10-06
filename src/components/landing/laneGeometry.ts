/**
 * The shape of the hero's two envelope lanes, as plain arithmetic.
 *
 * A lane is a curve shaped ( or ): its centre is `r0` from the middle of the
 * hero at the apex (height `y0`) and comes back towards the middle above and
 * below it, dropping `k` pixels sideways per pixel² of height away from the
 * apex. Far from the apex the curve carries on as a straight line (from `lim`
 * on), so it never folds back over itself. An envelope turns gently with the
 * slope of the curve it rides on, and fades by its own tilted edge.
 *
 * Kept free of the DOM so the rules can be tested; streamsEngine.ts draws with
 * them.
 */

export type LaneCurve = {
  /** Distance of the lane's centre from the middle of the hero, at the apex. */
  r0: number;
  /** Sideways drop, in px, per px² of height away from the apex. */
  k: number;
  /** Height of the apex. */
  y0: number;
  /** Height away from the apex beyond which the curve carries on straight. */
  lim: number;
};

const DEG = 180 / Math.PI;

const smooth = (v: number) => {
  const t = Math.min(1, Math.max(0, v));
  return t * t * (3 - 2 * t);
};

/** How far the lane's centre is from the middle of the hero at height `y`. */
export function laneOffset(curve: LaneCurve, y: number): number {
  const a = Math.abs(y - curve.y0);
  const { k, lim } = curve;
  const drop = a <= lim ? k * a * a : k * lim * lim + 2 * k * lim * (a - lim);
  return curve.r0 - drop;
}

/**
 * How far the lane leans towards the middle, in degrees, going up at height
 * `y`: positive above the apex (coming back in), negative below it (heading
 * out), zero at the apex. The same for both lanes, which mirror each other.
 */
export function laneLean(curve: LaneCurve, y: number): number {
  const dy = Math.min(curve.lim, Math.max(-curve.lim, y - curve.y0));
  return Math.atan(-2 * curve.k * dy) * DEG;
}

/**
 * The tilt of an envelope on the lane, in degrees clockwise.
 *
 * Every envelope leans about 13° one way, as in the approved frame (left lane
 * clockwise, right lane the other way, `dir` being +1 and -1), plus a little
 * of its own. The lane's lean turns it back towards upright and a little over
 * where the lane comes in to the middle, and further over where it heads out.
 * The response is quadratic, so near the apex it hardly moves, and it
 * saturates, so no envelope ever stands up on its end and becomes unreadable.
 */
export function paperTilt(dir: 1 | -1, lean: number, own = 0): number {
  const reach = lean > 0 ? 25 : 5;
  const turn = Math.sign(lean) * reach * Math.tanh((lean / 25) ** 2);
  return dir * (13 + own - turn);
}

/**
 * How visible an envelope is, from the position of its tilted paper: gone
 * while its top edge (`top`) is above `t0` and fully shown from `t1` down, and
 * gone while its bottom edge (`bottom`) is below `b0`, fully shown from `b1` up.
 */
export function edgeFade(top: number, bottom: number, t0: number, t1: number, b0: number, b1: number): number {
  return Math.min(smooth((top - t0) / (t1 - t0)), smooth((b0 - bottom) / (b0 - b1)));
}

/** Keep a tilted paper's bounding corner outside measured central text.
 * Approach the guard gradually before entering its vertical band. */
export function protectLaneX(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  dir: 1 | -1,
  regions: ReadonlyArray<{ left: number; right: number; top: number; bottom: number }>,
  margin: number,
  falloff: number,
): number {
  for (const rect of regions) {
    const distance = Math.max(rect.top - (y + halfHeight), y - halfHeight - rect.bottom, 0);
    const weight = 1 - smooth(distance / falloff);
    const edge = dir > 0 ? rect.left - halfWidth - margin : rect.right + halfWidth + margin;
    const correction = Math.max(0, (x - edge) * dir);
    x -= dir * correction * weight;
  }
  return x;
}
