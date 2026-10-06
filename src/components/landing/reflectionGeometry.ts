type Point = { x: number; y: number };

export type ReflectionSource = {
  /** Horizontal distance from the outside edge, on either side. */
  x: number;
  y: number;
  rotation: number;
  depth: number;
  width: number;
  height: number;
};

const smooth = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};

/** An illustrative projection onto the measured SVG surface, not a physical
 * optics simulation. Samples are ordered by height in the scene's CSS pixels. */
export function reflectionPose(source: ReflectionSource, surface: readonly Point[], unit: number) {
  if (surface.length < 2) return null;
  let lo = 0;
  let hi = surface.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (surface[mid].y <= source.y) lo = mid;
    else hi = mid;
  }
  const a = surface[lo];
  const b = surface[hi];
  const t = Math.max(0, Math.min(1, (source.y - a.y) / Math.max(1, b.y - a.y)));
  const surfaceX = a.x + (b.x - a.x) * t;
  const slope = (b.x - a.x) / Math.max(1, b.y - a.y);
  const angle = Math.atan(slope) * 180 / Math.PI;
  const rad = source.rotation * Math.PI / 180;
  const halfWidth = (source.width * Math.abs(Math.cos(rad)) + source.height * Math.abs(Math.sin(rad))) * source.depth / 2;
  const distance = Math.abs(source.x + halfWidth - surfaceX);
  const proximity = 1 - smooth(distance / (source.width * 0.78));
  return {
    // Keep a source-dependent displacement along the surface: neither a
    // reflection about the offscreen paper edge nor a clamped static patch.
    x: surfaceX + (source.x - surfaceX) * 0.2,
    y: source.y + (54 + 20 * proximity) * unit + slope * (source.x - surfaceX) * 0.08,
    rotation: -source.rotation + angle * 0.22,
    skew: Math.max(-10, Math.min(10, angle * 0.2)),
    scaleX: 0.5 - 0.08 * proximity,
    scaleY: 0.76 + 0.06 * proximity,
    proximity,
    blur: (1.6 + 0.7 * (1 - proximity)) * unit,
  };
}
