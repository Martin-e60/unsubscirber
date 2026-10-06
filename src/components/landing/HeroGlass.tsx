import styles from "./HeroGlass.module.css";

/** Broad transparent surfaces in the approved frame, behind sharp paper.
 * The streams engine moves their illumination and source-linked reflections. */
function GlassSide({ side }: { side: "left" | "right" }) {
  const id = `hero-glass-${side}`;
  const ref = (name: string) => `url(#${id}-${name})`;
  const rim = "M-26 -65 C28 80 85 188 49 352 C15 493 -56 506 -29 665 C-8 776 44 852 96 961";
  const inner = "M54 -80 C126 71 198 190 183 361 C168 549 330 553 350 691 C362 788 287 858 210 965";
  const back = "M278 -65 C365 82 416 215 381 365 C338 532 408 603 367 733 C342 828 280 897 211 963";
  return (
    <div className={`${styles.side} ${styles[side]}`} data-glass-side={side}>
      <svg className={styles.base} data-glass-layer data-depth="1" viewBox="0 0 460 900" preserveAspectRatio="none" focusable="false">
        <defs>
          <linearGradient id={`${id}-haze`}>
            <stop offset="0" stopColor="#b8bdc3" stopOpacity=".54" />
            <stop offset=".3" stopColor="#d7dade" stopOpacity=".35" />
            <stop offset=".73" stopColor="#e6e8ea" stopOpacity=".24" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-body`}>
            <stop offset="0" stopColor="#c5c9ce" stopOpacity=".24" />
            <stop offset=".38" stopColor="#fff" stopOpacity=".13" />
            <stop offset=".75" stopColor="#bcc1c7" stopOpacity=".14" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <filter id={`${id}-wide`} x="-60%" y="-15%" width="220%" height="130%"><feGaussianBlur stdDeviation="17" /></filter>
          <filter id={`${id}-soft`} x="-40%" y="-10%" width="180%" height="120%"><feGaussianBlur stdDeviation="5" /></filter>
          <filter id={`${id}-fine`} x="-15%" y="-5%" width="130%" height="110%"><feGaussianBlur stdDeviation=".6" /></filter>
        </defs>
        <rect width="460" height="900" fill={ref("haze")} />
        <path d="M0 0 H300 C403 144 421 278 377 428 C355 519 405 605 368 744 C348 823 290 865 255 900 H0 Z" fill={ref("body")} />
        <g fill="none">
          <path data-glass-surface d={back} stroke="#9da4ad" strokeOpacity=".22" strokeWidth="44" filter={ref("wide")} />
          <path d={back} stroke="#fff" strokeOpacity=".92" strokeWidth="15" filter={ref("soft")} transform="translate(19 0)" />
          <path d={inner} stroke="#a4aab2" strokeOpacity=".3" strokeWidth="46" filter={ref("wide")} />
          <path d={inner} stroke="#fff" strokeOpacity=".96" strokeWidth="20" filter={ref("soft")} transform="translate(-16 0)" />
          <path d={inner} stroke="#fff" strokeOpacity=".43" strokeWidth="3" filter={ref("fine")} transform="translate(9 0)" />
          <path d="M-15 -80 C62 116 139 202 112 383 C88 531 138 674 226 807" stroke="#fff" strokeOpacity=".78" strokeWidth="29" filter={ref("wide")} />
          <path d={rim} stroke="#737e8a" strokeOpacity=".5" strokeWidth="25" filter={ref("soft")} transform="translate(-12 0)" />
          <path d={rim} stroke="#fff" strokeOpacity=".95" strokeWidth="9" filter={ref("soft")} />
          <path d={rim} stroke="#6f7a86" strokeOpacity=".65" strokeWidth="1.1" transform="translate(3 0)" />
          <path d={rim} stroke="#fff" strokeOpacity=".98" strokeWidth="2.4" filter={ref("fine")} />
          <path d={rim} stroke="#fff" strokeOpacity=".6" strokeWidth="3" transform="translate(-15 0)" />
        </g>
      </svg>
      <span className={styles.sheen} data-glass-layer data-glass-light data-depth="1" />
    </div>
  );
}

export function HeroGlass() {
  return <><GlassSide side="left" /><GlassSide side="right" /></>;
}
