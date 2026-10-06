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
    // The trace shares the source's height. Its opposite tilt exposes folds
    // beside the opaque paper, rather than a miniature card shifted below it.
    x: surfaceX + (source.x - surfaceX) * 0.45,
    y: source.y + slope * (source.x - surfaceX) * 0.18,
    rotation: -source.rotation + angle * 0.22,
    skew: Math.max(-10, Math.min(10, angle * 0.2)),
    scaleX: 0.82 - 0.04 * proximity,
    scaleY: 0.9 + 0.02 * proximity,
    surfaceX,
    surfaceAngle: angle,
    proximity,
    blur: (1.6 + 0.7 * (1 - proximity)) * unit,
  };
}

/** One soft boundary for the entire reflection composite. The measured back
 * curve and its broad grazing band define where paper is visible in the glass;
 * an envelope-local ellipse would erase those same exposed corner folds. */
export function reflectionSurfaceMask(
  surface: readonly Point[], width: number, height: number, direction: 1 | -1, unit: number,
) {
  if (surface.length < 2 || width <= 0 || height <= 0) return "none";
  const soft = 11 * unit;
  const outer = direction > 0 ? 0 : width;
  const edge = surface.map(point => {
    // Fade before the strip ends as well as along the curved glass boundary.
    const x = Math.min(width - 2 * soft, point.x + 42 * unit);
    return `${(direction > 0 ? x : width - x).toFixed(2)},${point.y.toFixed(2)}`;
  }).join(" ");
  const points = `${outer},${surface[0].y.toFixed(2)} ${edge} ${outer},${surface[surface.length - 1].y.toFixed(2)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><filter id="fade" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${soft.toFixed(2)}"/></filter></defs><polygon points="${points}" fill="white" filter="url(#fade)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
