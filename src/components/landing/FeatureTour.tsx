"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { TOUR_FEATURES, activeFeature } from "./tour";
import styles from "./FeatureTour.module.css";

/**
 * The feature presentation below the hero.
 *
 * On a wide screen the four names stand on the left and stay put while the
 * four previews on the right scroll past in the page's own flow. The name of
 * the preview that has reached the middle of the window is the current one.
 * Nothing here moves the page, listens to the wheel or snaps: it only reads
 * where the previews are. On a narrow screen the names are left out and the
 * previews follow one another, each with its own title.
 */

/** Where in the window a preview becomes current: the middle. */
const ANCHOR = 0.5;

export function FeatureTour() {
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    let frame = 0;

    function update() {
      frame = 0;
      const tops = items.current.map((node) => node?.getBoundingClientRect().top ?? Infinity);
      setActive(activeFeature(tops, window.innerHeight * ANCHOR));
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  function goTo(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = document.getElementById(`tour-${id}`);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <section className={styles.tour} id="tour" aria-label="Inside Tidely">
      <div className={styles.inner}>
        <div className={styles.side}>
          <p className={styles.eyebrow}>Inside Tidely</p>
          <nav aria-label="Features">
            <ul className={styles.names}>
              {TOUR_FEATURES.map((feature, index) => (
                <li key={feature.id}>
                  <a
                    href={`#tour-${feature.id}`}
                    className={styles.name}
                    aria-current={index === active ? "true" : undefined}
                    onClick={(event) => goTo(event, feature.id)}
                  >
                    {feature.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className={styles.features}>
          {TOUR_FEATURES.map((feature, index) => (
            <article
              key={feature.id}
              id={`tour-${feature.id}`}
              className={styles.feature}
              ref={(node) => {
                items.current[index] = node;
              }}
            >
              <div className={styles.preview}>
                <img
                  src={feature.image}
                  alt={feature.alt}
                  width={2560}
                  height={2080}
                  loading="lazy"
                  decoding="async"
                  className={styles.shot}
                />
              </div>
              <h3 className={styles.title}>{feature.name}</h3>
              <p className={styles.text}>{feature.description}</p>
              <p className={styles.note}>Illustrative screenshot. Sample data.</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
