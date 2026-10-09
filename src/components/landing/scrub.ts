/**
 * Scroll-scrubbed reveals, without an animation library.
 *
 * Each target is revealed by scroll position, not by time, and reverses when
 * you scroll back up. The raw progress is where the trigger sits between two
 * lines of the window (a "start" and an "end", as fractions of its height);
 * what is drawn lags behind it by one second, which is the smoothing the
 * approved reference gets from `scrub: 1`. The same two curves are used:
 * the lag eases out over a second, and the lifted value eases out again.
 *
 * Nothing is hidden until this runs, and it does not run at all for reduced
 * motion, so the content is never left invisible.
 */

export type ScrubTarget = {
  /** Measured, so it must not move with the animation itself. */
  trigger: Element;
  /** What is lifted and faded. */
  node: HTMLElement;
  /** How far below its place it starts, in pixels. */
  rise: number;
  /** Window fractions, from the top: the reveal begins at `start`, ends at `end`. */
  start: number;
  end: number;
};

const SMOOTHING_MS = 1000;

/** GSAP's power3.out. */
const easeOut = (t: number) => 1 - (1 - t) ** 4;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

type State = {
  target: ScrubTarget;
  /** What is drawn, 0–1. */
  shown: number;
  /** Where the current catch-up started, where it is heading, and when it began. */
  from: number;
  to: number;
  since: number;
};

export function scrubReveal(targets: ScrubTarget[]): () => void {
  const states: State[] = targets.map((target) => ({
    target,
    shown: 0,
    from: 0,
    to: 0,
    since: 0,
  }));
  let frame = 0;

  function paint({ target, shown }: State) {
    const eased = easeOut(shown);
    target.node.style.opacity = String(eased);
    target.node.style.transform =
      eased === 1 ? "" : `translate3d(0, ${(1 - eased) * target.rise}px, 0)`;
  }

  function progress({ target }: State) {
    const { top } = target.trigger.getBoundingClientRect();
    const height = window.innerHeight;
    return clamp01((height * target.start - top) / (height * (target.start - target.end)));
  }

  /** Scrolled or resized: aim every target at its new raw progress. */
  function retarget() {
    const now = performance.now();
    for (const state of states) {
      const to = progress(state);
      if (to === state.to) continue;
      state.from = state.shown;
      state.to = to;
      state.since = now;
    }
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    frame = 0;
    let moving = false;
    for (const state of states) {
      if (state.shown === state.to) continue;
      const t = clamp01((now - state.since) / SMOOTHING_MS);
      state.shown = t === 1 ? state.to : state.from + (state.to - state.from) * easeOut(t);
      paint(state);
      if (t < 1) moving = true;
    }
    if (moving) frame = requestAnimationFrame(tick);
  }

  // Start where the window already is: no catch-up on load or a deep link.
  for (const state of states) {
    state.to = state.shown = state.from = progress(state);
    paint(state);
  }

  window.addEventListener("scroll", retarget, { passive: true });
  window.addEventListener("resize", retarget);
  return () => {
    window.removeEventListener("scroll", retarget);
    window.removeEventListener("resize", retarget);
    if (frame) cancelAnimationFrame(frame);
    for (const { target } of states) {
      target.node.style.opacity = "";
      target.node.style.transform = "";
    }
  };
}
