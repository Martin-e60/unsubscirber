/**
 * The maths behind the hero's glass background that needs no browser: how the
 * approved 1672 × 941 composition is fitted into whatever box the hero is, and
 * the elastic modes that bend each sheet. Kept apart from the WebGL code so it
 * can be tested on its own.
 */

/** The size, in pixels, of the frame the approved composition was built in. */
export const FRAME_WIDTH = 1672;
export const FRAME_HEIGHT = 941;

/**
 * Page units (`--u`, see theme.module.css) per pixel in that frame: the
 * approved text was laid out at min(1672, 1.6 × 941) / 1440. A window whose
 * text is this scale wants the reading zone left clear at the frame's size.
 */
const REFERENCE_TEXT_SCALE = Math.min(FRAME_WIDTH, 1.6 * FRAME_HEIGHT) / 1440;

/** How wide the glass box is allowed to be as a backbuffer, in device pixels. */
const MAX_BACKBUFFER_WIDTH = 1920;
const MAX_PIXEL_RATIO = 1.5;

/** The box the background fills, and where the text sits in it (CSS pixels). */
export interface GlassLayout {
  /** The size of the whole canvas box. */
  width: number;
  height: number;
  /** The height of the first screen. The box is taller than it by the tour's
   *  rounded-corner strip, which carries the scene on without a seam. */
  screenHeight: number;
  /** The centre of the copy, measured from the top left of the box. */
  anchorX: number;
  anchorY: number;
  /** The page's `--u` unit, in CSS pixels: how big the copy is. */
  unit: number;
  devicePixelRatio: number;
}

/** Everything the shaders need, derived from a layout. */
export interface GlassView {
  /** The backbuffer, in device pixels. */
  pixelWidth: number;
  pixelHeight: number;
  /** clip = world.xy * scale / perspective + offset */
  scaleX: number;
  scaleY: number;
  offsetY: number;
  /** The reading zone: centre in backbuffer pixels (y up) and its scale
   *  relative to the reference frame. */
  quietX: number;
  quietY: number;
  quietScale: number;
}

/**
 * Fits the frame over the first screen the way `object-fit: cover` would: the
 * same composition, uniformly scaled, never stretched, with the overflow
 * cropped. The reading zone does not follow that scale; it follows the copy,
 * which has a size of its own (`unit`), so the text stays in clear glass-free
 * black at every window shape.
 */
export function glassView(layout: GlassLayout): GlassView {
  const ratio = Math.min(layout.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const pixelWidth = Math.max(
    1,
    Math.min(MAX_BACKBUFFER_WIDTH, Math.round(layout.width * ratio)),
  );
  const k = pixelWidth / layout.width;
  const pixelHeight = Math.max(1, Math.round(layout.height * k));

  const screenHeight = Math.min(layout.screenHeight, layout.height) * k;
  const cover = Math.max(
    pixelWidth / FRAME_WIDTH,
    screenHeight / FRAME_HEIGHT,
  );

  return {
    pixelWidth,
    pixelHeight,
    scaleX: (FRAME_HEIGHT * cover) / pixelWidth,
    scaleY: (FRAME_HEIGHT * cover) / pixelHeight,
    // The frame is centred on the first screen, not on the taller box.
    offsetY: 1 - screenHeight / pixelHeight,
    quietX: layout.anchorX * k,
    quietY: pixelHeight - layout.anchorY * k,
    quietScale: (layout.unit / REFERENCE_TEXT_SCALE) * k,
  };
}

/** The page's `--u`: min(100vw, 160svh) / 1440. */
export function pageUnit(viewportWidth: number, viewportHeight: number) {
  return Math.min(viewportWidth, 1.6 * viewportHeight) / 1440;
}

/**
 * One damped, driven oscillator in its steady state:
 * q'' + 2·zeta·w0·q' + w0²·q = w0²·A·sin(w·t + phase). Its amplitude and phase
 * lag give the sheets a smooth local inertia.
 */
export function oscillator(
  t: number,
  w: number,
  w0: number,
  zeta: number,
  phase: number,
  amplitude: number,
) {
  const d = w0 * w0 - w * w;
  const b = 2 * zeta * w0 * w;
  return (
    ((amplitude * w0 * w0) / Math.hypot(d, b)) *
    Math.sin(w * t + phase - Math.atan2(b, d))
  );
}

/** The four bending / torsion modes of a sheet with phase `ph` at time `t`. */
export function modes(t: number, ph: number): [number, number, number, number] {
  return [
    oscillator(t, 0.53, 1.05, 0.38, ph, 0.7) +
      oscillator(t, 0.23, 1.05, 0.38, ph * 1.7, 0.25),
    oscillator(t, 0.67, 1.21, 0.41, ph + 1.1, 0.75),
    oscillator(t, 0.44, 0.89, 0.43, ph + 2.6, 0.72) +
      oscillator(t, 0.79, 0.89, 0.43, ph * 0.8, 0.2),
    oscillator(t, 0.74, 1.6, 0.32, ph + 4.0, 0.7),
  ];
}

/**
 * The six sheets. All share one drift direction and speed (`rate`), and each
 * sways around its own heading by a bounded amount — that is what keeps the
 * glass spread evenly round the reading zone instead of bunching up.
 */
export interface SheetSpec {
  wa: number;
  ww: number;
  wp: number;
  a: number;
  rate: number;
  span: number;
  width: number;
  ph: number;
  rx: number;
  ry: number;
  z: number;
  opacity: number;
}

export const SHEETS: readonly SheetSpec[] = [
  { wa: 0.3, ww: 0.09, wp: 0.4, a: 2.14, rate: 0.072, span: 1.92, width: 0.49, ph: 0.24, rx: 2.07, ry: 1.15, z: -0.05, opacity: 0.97 },
  { wa: 0.26, ww: 0.07, wp: 2.1, a: 2.35, rate: 0.072, span: 1.95, width: 0.3, ph: 1.9, rx: 2.1, ry: 1.24, z: -0.1, opacity: 0.71 },
  { wa: 0.32, ww: 0.11, wp: 4.0, a: 4.18, rate: 0.072, span: 2.42, width: 0.54, ph: 2.8, rx: 2.0, ry: 1.04, z: 0.11, opacity: 0.97 },
  { wa: 0.27, ww: 0.08, wp: 1.2, a: 4.02, rate: 0.072, span: 1.98, width: 0.29, ph: 4.1, rx: 2.12, ry: 1.04, z: -0.05, opacity: 0.63 },
  { wa: 0.3, ww: 0.1, wp: 5.3, a: 0.03, rate: 0.072, span: 2.25, width: 0.45, ph: 5.2, rx: 1.8, ry: 1.23, z: 0.08, opacity: 0.97 },
  { wa: 0.25, ww: 0.065, wp: 3.3, a: -0.15, rate: 0.072, span: 2.05, width: 0.26, ph: 6.3, rx: 1.93, ry: 1.22, z: -0.13, opacity: 0.64 },
];

/** The heading of a sheet at time `t`: its base plus the bounded sway. */
export function sheetTurn(sheet: SheetSpec, t: number) {
  return sheet.a + sheet.wa * Math.sin(sheet.ww * t + sheet.wp);
}

/**
 * The pose shown first, and held still under reduced motion: a balanced one,
 * the same as the approved live reference frame.
 */
export const START_TIME = 65;
