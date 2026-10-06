import styles from "./HeroGlass.module.css";

/**
 * The glass at the hero's outer edges.
 *
 * On each side, a broad sculpted surface seen at a graze: a clear body whose
 * edge curves in from the screen's edge and back out, shade where the glass
 * is thick just inside the rim, a hairline and a bright rim with a soft glow,
 * a halo and a second fainter rim beyond them, and long, soft highlights and
 * shadows sweeping across the haze that fades into the page. Drawn as static
 * SVG in the hero's neutral grayscale tokens, so a theme change is a change of
 * tokens.
 *
 * Nothing is drawn per envelope here: the reflections and the light a passing
 * envelope casts on the glass belong to the streams (HeroStreams.tsx), which
 * share the glass's depth. What the engine does move is the two layers marked
 * data-glass-layer — the drawing (a little against the pointer and slower than
 * the scroll, for depth) and a broad sheen over it (a little with the pointer,
 * for the light) — by small, damped shifts that never reach the copy.
 *
 * Each side is laid out in a 300 × 900 box (the approved 1440 × 900 frame's
 * strip), with a margin all round for the shifts above, and scaled to cover
 * the hero's strip without distortion, anchored at the outer edge, so the rims
 * keep their curvature. The right side is drawn
 * to its own proportions and mirrored. Purely decorative.
 */

type Ring = { cx: number; cy: number; rx: number; ry: number };

type Side = {
  id: string;
  /** The body of the glass: its rim is the bright curve. */
  lens: Ring;
  /** Long soft highlights (light) and shadows (shade) across the haze. */
  sweeps: Array<Ring & { width: number; shade?: boolean }>;
  /** Slanting streaks of light and shade, the glass catching the room. */
  streaks: Array<{ cx: number; cy: number; rx: number; ry: number; r: number; shade?: boolean }>;
  glints: Array<{ cx: number; cy: number; rx: number; ry: number; r: number }>;
};

const LEFT: Side = {
  id: "glass-l",
  lens: { cx: -362, cy: 452, rx: 407, ry: 770 },
  sweeps: [
    { cx: -560, cy: 300, rx: 720, ry: 540, width: 46 },
    { cx: -520, cy: 366, rx: 720, ry: 540, width: 30, shade: true },
    { cx: -470, cy: 640, rx: 600, ry: 880, width: 32 },
    { cx: -420, cy: 700, rx: 590, ry: 880, width: 22, shade: true },
  ],
  streaks: [
    { cx: 78, cy: 118, rx: 190, ry: 20, r: -42 },
    { cx: 52, cy: 196, rx: 170, ry: 12, r: -42, shade: true },
    { cx: 126, cy: 742, rx: 170, ry: 16, r: 30 },
    { cx: 150, cy: 810, rx: 140, ry: 10, r: 30, shade: true },
  ],
  glints: [
    { cx: 70, cy: 150, rx: 7, ry: 90, r: 24 },
    { cx: 118, cy: 690, rx: 6, ry: 70, r: -14 },
  ],
};

const RIGHT: Side = {
  id: "glass-r",
  lens: { cx: -350, cy: 430, rx: 395, ry: 740 },
  sweeps: [
    { cx: -520, cy: 600, rx: 690, ry: 620, width: 44 },
    { cx: -480, cy: 664, rx: 690, ry: 620, width: 28, shade: true },
    { cx: -450, cy: 280, rx: 590, ry: 800, width: 30 },
    { cx: -400, cy: 220, rx: 580, ry: 800, width: 20, shade: true },
  ],
  streaks: [
    { cx: 92, cy: 150, rx: 180, ry: 18, r: -36 },
    { cx: 70, cy: 226, rx: 160, ry: 11, r: -36, shade: true },
    { cx: 118, cy: 700, rx: 175, ry: 17, r: 34 },
    { cx: 140, cy: 770, rx: 135, ry: 10, r: 34, shade: true },
  ],
  glints: [
    { cx: 84, cy: 220, rx: 7, ry: 84, r: 18 },
    { cx: 126, cy: 640, rx: 6, ry: 76, r: -20 },
  ],
};

function GlassSide({ side, className, name }: { side: Side; className: string; name: "left" | "right" }) {
  const { id, lens } = side;
  const ref = (key: string) => `url(#${id}-${key})`;
  /** The lens's outline, offset by `d` (positive: outwards). */
  const ring = (d: number) => ({ cx: lens.cx, cy: lens.cy, rx: lens.rx + d, ry: lens.ry + d });
  return (
    <div className={className} data-glass-side={name}>
      <svg
        className={styles.base}
        data-glass-layer
        data-depth="1"
        viewBox="-24 -48 348 996"
        preserveAspectRatio="xMinYMid slice"
        focusable="false"
      >
        <defs>
          <linearGradient id={`${id}-haze`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" className={styles.hazeStrong} />
            <stop offset="0.5" className={styles.hazeSoft} />
            <stop offset="1" className={styles.clear} />
          </linearGradient>
          <radialGradient
            id={`${id}-body`}
            gradientUnits="userSpaceOnUse"
            cx={lens.cx}
            cy={lens.cy}
            r={lens.rx}
            gradientTransform={`translate(${lens.cx} ${lens.cy}) scale(1 ${lens.ry / lens.rx}) translate(${-lens.cx} ${-lens.cy})`}
          >
            <stop offset="0.78" className={styles.bodyCore} />
            <stop offset="0.95" className={styles.bodyEdge} />
            <stop offset="1" className={styles.bodyRim} />
          </radialGradient>
          <filter id={`${id}-wide`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
          <filter id={`${id}-fine`} x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation="0.5" />
          </filter>
        </defs>

        {/* The haze that carries the glass out into the page. */}
        <rect x="-24" y="-48" width="348" height="996" fill={ref("haze")} />

        {/* Long soft highlights and shadows, broad as tubes of glass. */}
        {side.sweeps.map((s, i) => (
          <ellipse
            key={i}
            className={s.shade ? styles.sweepShade : styles.sweep}
            cx={s.cx}
            cy={s.cy}
            rx={s.rx}
            ry={s.ry}
            strokeWidth={s.width}
            filter={ref("wide")}
          />
        ))}

        {/* The lens body: clear, a little milky towards its rim. */}
        <ellipse cx={lens.cx} cy={lens.cy} rx={lens.rx} ry={lens.ry} fill={ref("body")} />

        {/* A halo beyond the rim, and the second, fainter rim after it. */}
        <ellipse className={styles.halo} {...ring(30)} filter={ref("soft")} />
        <ellipse className={styles.echoLine} {...ring(86)} filter={ref("fine")} />
        <ellipse className={styles.echo} {...ring(92)} filter={ref("glow")} />

        {/* Thickness: the shade just inside the rim, with a line within it. */}
        <ellipse className={styles.shade} {...ring(-20)} filter={ref("soft")} />
        <ellipse className={styles.inner} {...ring(-38)} filter={ref("fine")} />

        {/* The rim: a hairline, then the bright edge with its glow. */}
        <ellipse className={styles.hair} {...ring(1.5)} filter={ref("fine")} />
        <ellipse className={styles.glow} {...ring(-2)} filter={ref("glow")} />
        <ellipse className={styles.rim} {...ring(-2)} filter={ref("fine")} />

        {side.streaks.map((s, i) => (
          <ellipse
            key={i}
            className={s.shade ? styles.streakShade : styles.streak}
            cx={s.cx}
            cy={s.cy}
            rx={s.rx}
            ry={s.ry}
            transform={`rotate(${s.r} ${s.cx} ${s.cy})`}
            filter={ref("wide")}
          />
        ))}

        {side.glints.map((g, i) => (
          <ellipse
            key={i}
            className={styles.glint}
            cx={g.cx}
            cy={g.cy}
            rx={g.rx}
            ry={g.ry}
            transform={`rotate(${g.r} ${g.cx} ${g.cy})`}
            filter={ref("soft")}
          />
        ))}
      </svg>

      {/* The light on the glass: a broad, faint sheen the pointer slides. */}
      <span className={styles.sheen} data-glass-layer data-glass-light data-depth="1" />
    </div>
  );
}

export function HeroGlass() {
  return (
    <>
      <GlassSide side={LEFT} className={`${styles.side} ${styles.left}`} name="left" />
      <GlassSide side={RIGHT} className={`${styles.side} ${styles.right}`} name="right" />
    </>
  );
}
