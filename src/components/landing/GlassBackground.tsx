"use client";

import { useEffect, useRef } from "react";
import { START_TIME, type GlassLayout } from "./glass-view";
import styles from "./GlassBackground.module.css";

/**
 * The animated background of the landing page: thin glass sheets drifting
 * round a clear reading zone. See glass-scene.ts for the picture; this decides
 * when it runs.
 *
 * One canvas, fixed to the window, is the first child of the page's stage. The
 * sections scroll in front of it and the glass stays where it is; each section
 * decides what shows through (see page.module.css, FeatureTour.module.css and
 * Faq.module.css). It is clipped to the stage, so it never reaches the footer.
 *
 * It is purely decorative and only an enhancement. The page's own backgrounds
 * are what shows until the first frame is ready, on a narrow screen, and
 * whenever WebGL 2 is unavailable or lost, and nothing is reported to the
 * visitor in any of those cases. While the glass is drawing, the stage carries
 * `data-glass="on"`, which is what lets the sections let it through.
 *
 * - Desktop only (the same breakpoint the hero's desktop layout starts at).
 * - Runs only while the tab is visible and the stage is on screen.
 * - With reduced motion it draws one still frame of the same scene.
 * - It never reads the pointer or the scroll position.
 *
 * It paints nothing but glass. Keeping the glass off the text is each
 * section's own business, in the section's own coordinates, so it moves with
 * the section as the page scrolls.
 */

const DESKTOP = "(min-width: 64rem)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function GlassBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The stage: the canvas's parent, which also holds the hero's copy.
    const stage = canvas.parentElement;
    const desktop = window.matchMedia(DESKTOP);
    const reduced = window.matchMedia(REDUCED_MOTION);

    let scene: import("./glass-scene").GlassScene | null = null;
    let failed = false;
    let disposed = false;
    let onScreen = true;
    let time = START_TIME;
    let smoothDt = 1 / 60;
    let lastNow = 0;
    let frameId = 0;

    const setShown = (shown: boolean) => {
      canvas.dataset.ready = shown ? "true" : "false";
      if (!stage) return;
      if (shown) stage.dataset.glass = "on";
      else delete stage.dataset.glass;
    };

    function measure(): GlassLayout | null {
      if (!canvas || !stage) return null;
      const box = canvas.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return null;
      return {
        width: box.width,
        height: box.height,
        devicePixelRatio: window.devicePixelRatio,
      };
    }

    function draw() {
      scene?.render(time);
    }

    function relayout() {
      const next = measure();
      if (!scene || !next) return;
      scene.layout(next);
      draw();
    }

    function tick(now: number) {
      frameId = requestAnimationFrame(tick);
      // Time moves by a smoothed step, so one slow frame is not a jump, and by
      // no more than a tenth of a second however long the gap was.
      const dt = lastNow ? (now - lastNow) / 1000 : 0;
      lastNow = now;
      smoothDt += (Math.min(dt, 0.12) - smoothDt) * 0.1;
      time += smoothDt;
      draw();
    }

    function setRunning(run: boolean) {
      if (run && !frameId) {
        lastNow = 0;
        frameId = requestAnimationFrame(tick);
      } else if (!run && frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    }

    /** Runs the loop only when there is something to see and a reason to move. */
    function update() {
      setRunning(
        !!scene && !reduced.matches && onScreen && !document.hidden,
      );
    }

    async function start() {
      if (scene || failed || disposed || !desktop.matches) return;
      const { createGlassScene } = await import("./glass-scene");
      // The import is asynchronous; the page may have changed meanwhile.
      if (disposed || scene || !desktop.matches) return;

      const created = createGlassScene(canvas!, {
        onContextLost() {
          setRunning(false);
          setShown(false);
        },
        onContextRestored() {
          relayout();
          setShown(true);
          update();
        },
      });
      if (!created) {
        failed = true;
        return;
      }
      scene = created;

      const first = measure();
      if (!first) {
        scene.dispose();
        scene = null;
        return;
      }
      scene.layout(first);
      draw();
      setShown(true);
      update();
    }

    function stop() {
      setRunning(false);
      setShown(false);
      scene?.dispose();
      scene = null;
    }

    function onDesktopChange() {
      if (desktop.matches) void start();
      else stop();
    }

    const resizeObserver = new ResizeObserver(relayout);
    resizeObserver.observe(canvas);

    // The stage off screen (only the footer in view): nothing to draw. This is
    // only an optimisation.
    const intersection = new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      update();
    });
    if (stage) intersection.observe(stage);

    const onVisibility = () => update();
    const onMotionChange = () => {
      // Moving to reduced motion leaves the frame where it stopped.
      update();
      draw();
    };
    document.addEventListener("visibilitychange", onVisibility);
    desktop.addEventListener("change", onDesktopChange);
    reduced.addEventListener("change", onMotionChange);

    void start();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      desktop.removeEventListener("change", onDesktopChange);
      reduced.removeEventListener("change", onMotionChange);
      stop();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      data-ready="false"
      aria-hidden="true"
    />
  );
}
