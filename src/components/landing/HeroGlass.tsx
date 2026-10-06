import styles from "./HeroGlass.module.css";

/**
 * The glass at the hero's outer edges (approved-hero-light-dark.png).
 *
 * On each side, the curved rims of broad lenses whose centres lie off
 * screen: a silver haze rising from the edge, a frosted body, a band of
 * shade just inside each rim, a bright rim with a soft glow, an echo ring
 * and a few glints. Drawn once as static SVG — nothing here moves — in the
 * hero's grayscale tokens, so the dark appearance comes from the same
 * drawing. The centre is left clear.
 *
 * Each side is laid out in a 400 × 700 box and scaled to cover its strip of
 * the hero without distortion, anchored at the outer edge, so the rims keep
 * their curvature and stay outside the envelope lanes on ordinary windows.
 * Purely decorative.
 */

type Ring = { cx: number; cy: number; rx: number; ry: number };

type Side = {
  id: string;
  lens: Ring;
  inner: Ring;
  echo: Ring;
  glints: Array<{ cx: number; cy: number; rx: number; ry: number; r: number }>;
};

const LEFT: Side = {
  id: "glass-l",
  lens: { cx: -170, cy: 439, rx: 360, ry: 688 },
  inner: { cx: -170, cy: 439, rx: 300, ry: 612 },
  echo: { cx: -170, cy: 439, rx: 430, ry: 791 },
  glints: [
    { cx: 120, cy: 103, rx: 14, ry: 103, r: 28 },
    { cx: 176, cy: 527, rx: 10, ry: 67, r: -12 },
  ],
};

const RIGHT: Side = {
  id: "glass-r",
  lens: { cx: -150, cy: 337, rx: 330, ry: 630 },
  inner: { cx: -150, cy: 337, rx: 215, ry: 527 },
  echo: { cx: -150, cy: 337, rx: 395, ry: 732 },
  glints: [
    { cx: 150, cy: 176, rx: 12, ry: 94, r: 18 },
    { cx: 168, cy: 483, rx: 12, ry: 82, r: -16 },
  ],
};

function GlassSide({ side, className }: { side: Side; className: string }) {
  const { id, lens, inner, echo } = side;
  const ref = (name: string) => `url(#${id}-${name})`;
  return (
    <svg className={className} viewBox="0 0 400 700" preserveAspectRatio="xMinYMid slice" focusable="false">
      <defs>
        <linearGradient id={`${id}-haze`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className={styles.hazeStrong} />
          <stop offset="0.55" className={styles.hazeSoft} />
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
          <stop offset="0.55" className={styles.bodyCore} />
          <stop offset="0.9" className={styles.bodyEdge} />
          <stop offset="1" className={styles.bodyRim} />
        </radialGradient>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id={`${id}-fine`} x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
        <filter id={`${id}-frost`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <clipPath id={`${id}-clip`}>
          <ellipse cx={lens.cx} cy={lens.cy} rx={lens.rx} ry={lens.ry} />
        </clipPath>
      </defs>

      <rect width="400" height="700" fill={ref("haze")} />

      {/* The lens body, frosted. */}
      <ellipse cx={lens.cx} cy={lens.cy} rx={lens.rx} ry={lens.ry} fill={ref("body")} />
      <g clipPath={ref("clip")}>
        <rect className={styles.frost} width="400" height="700" filter={ref("frost")} />
      </g>

      {/* Shaded depth just inside each rim. */}
      <ellipse
        className={styles.shade}
        cx={lens.cx}
        cy={lens.cy}
        rx={lens.rx - 26}
        ry={lens.ry - 26}
        filter={ref("soft")}
      />
      <ellipse
        className={styles.shadeSoft}
        cx={inner.cx}
        cy={inner.cy}
        rx={inner.rx - 18}
        ry={inner.ry - 18}
        filter={ref("soft")}
      />

      {/* An echo ring further out, barely there. */}
      <ellipse className={styles.echo} cx={echo.cx} cy={echo.cy} rx={echo.rx} ry={echo.ry} filter={ref("glow")} />

      {/* Bright rims, each with a soft glow. */}
      <ellipse className={styles.glow} cx={lens.cx} cy={lens.cy} rx={lens.rx} ry={lens.ry} filter={ref("glow")} />
      <ellipse className={styles.rim} cx={lens.cx} cy={lens.cy} rx={lens.rx} ry={lens.ry} filter={ref("fine")} />
      <ellipse className={styles.glow} cx={inner.cx} cy={inner.cy} rx={inner.rx} ry={inner.ry} filter={ref("glow")} />
      <ellipse className={styles.rimSoft} cx={inner.cx} cy={inner.cy} rx={inner.rx} ry={inner.ry} filter={ref("fine")} />

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
  );
}

export function HeroGlass() {
  return (
    <>
      <GlassSide side={LEFT} className={`${styles.side} ${styles.left}`} />
      <GlassSide side={RIGHT} className={`${styles.side} ${styles.right}`} />
    </>
  );
}
