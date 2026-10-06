/**
 * The landing hero's envelope streams: what is shown, and how it moves.
 *
 * Two curved lanes of folded paper envelopes rise beside the centred copy,
 * shaped ( ): each bows outward at mid-height and comes back towards the
 * middle at both ends, and every envelope turns gently with the slope of its
 * lane. Hovering or focusing one holds it still and reveals its Unsubscribe
 * control; activating that dissolves the whole envelope into fine dust that
 * curves through the free space into the lower corner of the Try the demo
 * button, which answers with a small grayscale pulse. Nothing navigates.
 *
 * The glass at the hero's edges is lit by the same loop: each envelope near it
 * is mirrored there (faint, softened, squeezed by the curve of the surface)
 * and lights the glass beside it as it passes, and the glass answers the
 * pointer and the scroll with a small, damped shift of its own light.
 *
 * Plain DOM, two canvases and one requestAnimationFrame loop. HeroStreams.tsx
 * renders a fixed pool of envelopes per lane once; this file only recycles
 * them, and particles live in a capped pool, so nothing accumulates.
 *
 * Everything is illustrative: the senders are invented and picked from the
 * lists below. Nothing reads a mailbox, calls the network or changes state.
 *
 * Coordinates are CSS pixels. Envelopes and motes are placed relative to the
 * streams layer; dust is drawn relative to the hero, so it can reach the CTA.
 */

import { edgeFade, laneLean, laneOffset, paperTilt, protectLaneX } from "./laneGeometry";

export type Side = "left" | "right";
export type Sample = { sender: string; subject: string; time: string };

/** The first envelopes on screen, top to bottom, as in the approved design. */
export const OPENING: Record<Side, Sample[]> = {
  left: [
    { sender: "Weekly Offers", subject: "New deals every week", time: "Tue" },
    { sender: "Daily Deals", subject: "Huge savings just for you", time: "Fri" },
    { sender: "Notes on Design", subject: "Ideas, tools and thoughtful reads", time: "Fri" },
  ],
  right: [
    { sender: "Flash Sale", subject: "24 hours only", time: "9:17 AM" },
    { sender: "Sunday Stories", subject: "A slower, kinder internet", time: "Sun" },
    { sender: "Friends & Family", subject: "Catching up from home", time: "Apr 16" },
  ],
};

const SAMPLES: Sample[] = [
  ...OPENING.left,
  ...OPENING.right,
  { sender: "Last Chance", subject: "Don’t miss these offers", time: "8:11 AM" },
  { sender: "Morning Brief", subject: "Five things before coffee", time: "7:02 AM" },
  { sender: "Garden Club", subject: "What to plant in spring", time: "Wed" },
  { sender: "Member Rewards", subject: "Your points are waiting", time: "Mon" },
  { sender: "Travel Picks", subject: "Weekend escapes under $200", time: "Thu" },
  { sender: "The Reading List", subject: "Six essays worth your time", time: "Sat" },
  { sender: "Style Edit", subject: "New arrivals just landed", time: "11:40 AM" },
  { sender: "Kitchen Notes", subject: "Three dinners, one pan", time: "Sun" },
  { sender: "App Updates", subject: "What’s new this month", time: "Mar 3" },
  { sender: "Price Drop", subject: "Items you viewed are cheaper", time: "2:15 PM" },
  { sender: "Local Events", subject: "Happening near you this week", time: "Fri" },
  { sender: "Podcast Digest", subject: "New episodes you might like", time: "Tue" },
  { sender: "Home & Living", subject: "Small changes, calmer rooms", time: "May 2" },
  { sender: "Survey Team", subject: "Tell us how we did", time: "Mon" },
];

/** Envelopes rendered per lane; more than are ever visible, so exits can finish. */
export const POOL_PER_SIDE = 10;

/** Envelope height as a share of its width. */
export const ASPECT = 0.38;

/** Below this width the lanes move under the copy (matches page.module.css). */
const NARROW = "(max-width: 64rem)";

const SPEED = 25; // px per second at the reference size, desktop
const SPEED_NARROW = 17;
/** How quickly an envelope's speed follows what it wants (per second), and the
    time it takes to close a gap to the envelope ahead of it. */
const EASE = 6;
const FOLLOW = 0.55;
const DISSOLVE = 1.5; // seconds for an envelope to come apart
const DUST_PER_ENVELOPE = 320;
const MAX_DUST = 2400;
const MOTES_PER_LANE = 26;

/**
 * The approved frame (1440 × 900), in its own pixels; --u in page.module.css
 * is one of them. A lane's centre sits `apex` from the middle at its widest and
 * drops `bow` pixels sideways per pixel² of height away from it, so it comes
 * back towards the middle above and below: the ( and ) of the design.
 */
const REF = {
  width: 1440,
  height: 900,
  envelope: 288,
  apex: 497,
  bow: 0.0018,
  /** Height away from the apex beyond which the curve carries on straight. */
  reach: 360,
  /** Where the glass ends, and where an envelope touches it. */
  glass: 420,
  contact: 44,
};
/** The dissolve's crumbling band, in envelope widths (3em at width / 19). */
const BAND = 3 / 19;

/** How much of an envelope's brightness its reflection keeps. */
const MIRROR = 0.2;
const SPEC = 0.36;

// --- Small helpers ------------------------------------------------------------

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const smooth = (v: number) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * clamp(t)) / 2;
type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

function relativeRect(el: Element, to: DOMRect): Rect {
  const r = el.getBoundingClientRect();
  return {
    left: r.left - to.left,
    top: r.top - to.top,
    right: r.right - to.left,
    bottom: r.bottom - to.top,
    width: r.width,
    height: r.height,
  };
}

// --- Model ------------------------------------------------------------------------

type Pose = { x: number; y: number; r: number; k: number; o: number };

/** One dissolve's dust: how much, how much has arrived, and the shared route
    its particles gather onto, so they travel as one stream. */
type Burst = {
  expected: number;
  arrived: number;
  pulsed: boolean;
  p1: Point;
  p2: Point;
  p3: Point;
  /** Towards the copy: +1 from the left lane, -1 from the right. */
  dir: 1 | -1;
};

type Envelope = {
  el: HTMLElement;
  paper: HTMLElement;
  shade: HTMLElement;
  button: HTMLButtonElement;
  fields: { sender: HTMLElement; subject: HTMLElement; time: HTMLElement };
  /** Its reflection in the glass, and the light it casts there. */
  mirror: HTMLElement | null;
  glow: HTMLElement | null;
  mirrored: boolean;
  lane: Lane;
  state: "idle" | "flow" | "dissolve";
  sample: Sample | null;
  /** Distance risen from the lane's entry point. */
  d: number;
  /** Speed now, px per second: it follows what the envelope wants (held,
      queued behind another, free) rather than jumping to it. */
  v: number;
  jitter: number;
  /** Its own lean, before the lane's slope turns it. */
  tilt: number;
  depth: number;
  seed: number;
  hover: boolean;
  focus: boolean;
  touchUntil: number;
  // Dissolving
  t: number;
  progress: number;
  ox: number;
  oy: number;
  r: number;
  rMax: number;
  carry: number;
  burst: Burst | null;
  pose: Pose;
  filter: string;
  interactive: boolean;
  held: boolean;
  z: number;
  seq: number;
};

type Mote = { off: number; d: number; v: number; line: boolean; size: number; alpha: number };

type Lane = {
  side: Side;
  /** +1 for the left lane (the copy is to its right), -1 for the right. */
  dir: 1 | -1;
  /** The curve: centre's distance from the middle at the apex, its drop per
      px² of height away from `y0`, and where it carries on straight. */
  r0: number;
  k: number;
  y0: number;
  lim: number;
  /** Fully faded at `t0`/`b0`, fully shown at `t1`/`b1` (top and bottom). */
  t0: number;
  t1: number;
  b0: number;
  b1: number;
  entry: number;
  length: number;
  gap: number;
  minGap: number;
  envs: Envelope[];
  order: Envelope[];
  motes: Mote[];
  strip: HTMLElement | null;
  /** Where the strip's left edge is on the page (for the right lane). */
  stripX: number;
};

type Particle = {
  alive: boolean;
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
  puff: Point;
  noise: Point;
  age: number;
  dur: number;
  size: number;
  alpha: number;
  light: boolean;
  wobble: number;
  seed: number;
  arrived: boolean;
  burst: Burst;
};

/** A layer of the glass the pointer and the scroll move a little. */
type GlassLayer = { el: HTMLElement; sign: 1 | -1; depth: number; light: boolean };

// --- The scene --------------------------------------------------------------------

/**
 * Starts the streams inside `root` (the hero section) and returns a function
 * that stops them and removes every listener.
 *
 * With `animate` false the lanes are laid out once and stay still, the glass
 * does not follow the pointer or the scroll, and an unsubscribe fades the
 * envelope away instead of scattering it.
 */
export function startHeroStreams(root: HTMLElement, animate: boolean): () => void {
  const streams = root.querySelector<HTMLElement>("[data-streams]");
  if (!streams) return () => {};
  return new Streams(root, streams, animate).stop;
}

class Streams {
  private copy: HTMLElement | null;
  private cta: HTMLElement | null;
  private hint: HTMLElement | null;
  private dustCanvas: HTMLCanvasElement | null;
  private moteCanvas: HTMLCanvasElement | null;
  private dust: CanvasRenderingContext2D | null;
  private motes: CanvasRenderingContext2D | null;
  private narrowQuery = window.matchMedia(NARROW);

  private lanes: Lane[] = [];
  private envs: Envelope[] = [];
  private particles: Particle[] = [];
  private alive = 0;
  private dustDirty = false;

  private narrow = false;
  private u = 1;
  private width = 0;
  private height = 0;
  private envW = 0;
  private envH = 0;
  private pitch = 0;
  private reach = 0;
  private offset: Point = { x: 0, y: 0 };
  private ctaRect: Rect | null = null;
  private copyRect: Rect | null = null;
  /** The headline and the description: dust keeps out of them. */
  private keepOut: Rect[] = [];
  private colors = { dust: "#111", dust2: "#888", mote: "#111" };
  private colorsAt = -1;

  private now = 0;
  private last = 0;
  private frame = 0;
  private running = false;
  private inView = true;
  private deck: Sample[] = [];
  private seq = 0;

  // The glass: where the light is (damped towards where the pointer and the
  // scroll want it), and the layers that move with it.
  private layers: GlassLayer[] = [];
  private light = { x: 0, y: 0, s: 0, tx: 0, ty: 0, ts: 0, applied: false };
  private heroTop = 0;

  private pulseOn = false;
  private pulseSince = 0;
  private pulseOff = 0;
  private pulseCooldown = 0;
  private pulseTimer = 0;
  private timers = new Set<number>();

  private resize: ResizeObserver | null = null;
  private visibility: IntersectionObserver | null = null;
  private cleanups: Array<() => void> = [];

  constructor(
    private root: HTMLElement,
    private streams: HTMLElement,
    private animate: boolean,
  ) {
    this.copy = root.querySelector("[data-hero-copy]");
    this.cta = root.querySelector("[data-hero-cta]");
    this.hint = root.querySelector("[data-hero-hint]");
    this.dustCanvas = root.querySelector("canvas[data-dust]");
    this.moteCanvas = streams.querySelector("canvas[data-motes]");
    this.dust = this.dustCanvas?.getContext("2d") ?? null;
    this.motes = this.moteCanvas?.getContext("2d") ?? null;

    for (const side of ["left", "right"] as const) {
      const strip = streams.querySelector<HTMLElement>(`[data-mirrors][data-side="${side}"]`);
      const mirrors = strip ? [...strip.querySelectorAll<HTMLElement>("[data-mirror]")] : [];
      const glows = strip ? [...strip.querySelectorAll<HTMLElement>("[data-glow]")] : [];
      const lane: Lane = {
        side,
        dir: side === "left" ? 1 : -1,
        r0: 0,
        k: 0,
        y0: 0,
        lim: Infinity,
        t0: 0,
        t1: 0,
        b0: 0,
        b1: 0,
        entry: 0,
        length: 1,
        gap: 0,
        minGap: 0,
        envs: [],
        order: [],
        motes: Array.from({ length: MOTES_PER_LANE }, (_, i) => ({
          off: rand(-1, 1),
          d: 0,
          v: rand(0.75, 1.25),
          line: i % 3 !== 0,
          size: Math.random() < 0.4 ? rand(1.8, 2.8) : rand(0.8, 1.6),
          alpha: Math.random() < 0.5 ? rand(0.85, 1) : rand(0.3, 0.6),
        })),
        strip,
        stripX: 0,
      };
      const els = streams.querySelectorAll<HTMLElement>(`[data-env][data-side="${side}"]`);
      els.forEach((el, i) => lane.envs.push(this.adopt(el, lane, mirrors[i] ?? null, glows[i] ?? null)));
      this.lanes.push(lane);
      this.envs.push(...lane.envs);
    }

    // The glass layers that take the light.
    root.querySelectorAll<HTMLElement>("[data-glass-layer]").forEach((el) => {
      this.layers.push({
        el,
        sign: el.closest("[data-glass-side='right']") ? -1 : 1,
        depth: parseFloat(el.dataset.depth ?? "1") || 1,
        light: el.hasAttribute("data-glass-light"),
      });
    });

    this.shuffleDeck();
    this.readColors();
    this.measure(true);
    this.render();
    streams.setAttribute("data-ready", "");

    if (typeof ResizeObserver !== "undefined") {
      this.resize = new ResizeObserver(() => {
        this.measure(false);
        if (!this.running) this.render();
      });
      this.resize.observe(root);
    }

    const releaseTouch = (event: PointerEvent) => {
      for (const env of this.envs) {
        if (env.touchUntil && !env.el.contains(event.target as Node)) {
          env.touchUntil = 0;
          this.syncHeld(env);
        }
      }
    };
    document.addEventListener("pointerdown", releaseTouch);
    this.cleanups.push(() => document.removeEventListener("pointerdown", releaseTouch));

    if (!animate) return;

    // The glass answers the pointer (a mouse only) and the scroll, both read
    // without touching layout and applied, damped, in the loop below.
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      this.light.tx = clamp(((event.pageX - this.root.offsetLeft) / Math.max(1, this.root.clientWidth)) * 2 - 1, -1, 1);
      this.light.ty = clamp(((event.pageY - this.heroTop) / Math.max(1, this.root.clientHeight)) * 2 - 1, -1, 1);
    };
    const onLeave = () => {
      this.light.tx = 0;
      this.light.ty = 0;
    };
    const onScroll = () => {
      this.light.ts = clamp((window.scrollY - this.heroTop) / Math.max(1, this.root.clientHeight));
    };
    root.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    this.cleanups.push(() => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
    });
    onScroll();
    this.light.s = this.light.ts;

    if (typeof IntersectionObserver !== "undefined") {
      this.visibility = new IntersectionObserver(([entry]) => {
        this.inView = entry?.isIntersecting ?? true;
        this.sync();
      });
      this.visibility.observe(root);
    }
    document.addEventListener("visibilitychange", this.sync);
    this.sync();
  }

  stop = () => {
    this.setRunning(false);
    this.resize?.disconnect();
    this.visibility?.disconnect();
    document.removeEventListener("visibilitychange", this.sync);
    for (const cleanup of this.cleanups) cleanup();
    for (const timer of this.timers) clearTimeout(timer);
    clearTimeout(this.pulseTimer);
    for (const layer of this.layers) layer.el.style.transform = "";
    for (const lane of this.lanes) if (lane.strip) lane.strip.style.transform = "";
    this.cta?.removeAttribute("data-dust");
    this.streams.removeAttribute("data-ready");
  };

  // --- Lifecycle -------------------------------------------------------------------

  private sync = () => {
    this.setRunning(this.inView && document.visibilityState !== "hidden");
  };

  private setRunning(on: boolean) {
    if (on === this.running) return;
    this.running = on;
    if (on) {
      // Resume from where it stopped rather than catching up.
      this.last = 0;
      this.frame = requestAnimationFrame(this.tick);
    } else {
      cancelAnimationFrame(this.frame);
    }
  }

  private tick = (ms: number) => {
    if (!this.running) return;
    // Capped, so a dropped frame slows the scene instead of making it jump.
    const dt = this.last ? Math.min(0.05, (ms - this.last) / 1000) : 1 / 60;
    this.last = ms;
    this.step(dt);
    this.render();
    this.frame = requestAnimationFrame(this.tick);
  };

  private later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }

  // --- Envelopes ---------------------------------------------------------------------

  private adopt(el: HTMLElement, lane: Lane, mirror: HTMLElement | null, glow: HTMLElement | null): Envelope {
    const env: Envelope = {
      el,
      paper: el.querySelector<HTMLElement>("[data-paper]") ?? el,
      shade: el.querySelector<HTMLElement>("[data-shade]") ?? el,
      button: el.querySelector<HTMLButtonElement>("[data-unsub]")!,
      fields: {
        sender: el.querySelector<HTMLElement>("[data-sender]")!,
        subject: el.querySelector<HTMLElement>("[data-subject]")!,
        time: el.querySelector<HTMLElement>("[data-time]")!,
      },
      mirror,
      glow,
      mirrored: false,
      lane,
      state: "idle",
      sample: null,
      d: 0,
      v: 0,
      jitter: 0,
      tilt: 0,
      depth: 1,
      seed: rand(0, 10),
      hover: false,
      focus: false,
      touchUntil: 0,
      t: 0,
      progress: 0,
      ox: 0,
      oy: 0,
      r: 0,
      rMax: 0,
      carry: 0,
      burst: null,
      pose: { x: 0, y: 0, r: 0, k: 1, o: 0 },
      filter: "",
      // Rendered inert; placement makes it reachable once it is visible.
      interactive: false,
      held: false,
      z: 0,
      seq: 0,
    };

    // Nothing of an earlier run's reflections may be left showing.
    for (const el of [mirror, glow]) {
      if (!el) continue;
      el.style.visibility = "hidden";
      el.style.opacity = "0";
    }

    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement,
      type: K,
      fn: (event: HTMLElementEventMap[K]) => void,
    ) => {
      target.addEventListener(type, fn);
      this.cleanups.push(() => target.removeEventListener(type, fn));
    };

    on(el, "pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      env.hover = true;
      this.syncHeld(env);
    });
    on(el, "pointerleave", (event) => {
      if (event.pointerType !== "mouse") return;
      env.hover = false;
      this.syncHeld(env);
    });
    // Touch has no hover: the first tap holds the envelope and reveals its
    // control (which ignores pointers until then, so the tap cannot also
    // activate it); the next tap on the control unsubscribes.
    on(el, "pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      env.touchUntil = performance.now() + 5000;
      this.syncHeld(env);
      this.later(() => this.syncHeld(env), 5100);
    });
    on(el, "focusin", () => {
      env.focus = true;
      this.syncHeld(env);
    });
    on(el, "focusout", (event) => {
      env.focus = el.contains(event.relatedTarget as Node | null);
      this.syncHeld(env);
    });
    on(env.button, "click", (event) => {
      event.preventDefault();
      this.unsubscribe(env);
    });

    return env;
  }

  /** Whether something is keeping this envelope still. */
  private wantsHold(env: Envelope) {
    return env.hover || env.focus || env.touchUntil > performance.now();
  }

  private syncHeld(env: Envelope) {
    const held = env.state === "flow" && this.wantsHold(env);
    if (held === env.held) return;
    env.held = held;
    env.el.toggleAttribute("data-held", held);
  }

  private shuffleDeck() {
    const onScreen = new Set(this.envs.map((env) => env.sample?.sender));
    this.deck = SAMPLES.filter((s) => !onScreen.has(s.sender)).sort(() => Math.random() - 0.5);
  }

  private nextSample(): Sample {
    if (!this.deck.length) this.shuffleDeck();
    const onScreen = new Set(this.envs.map((env) => env.sample?.sender));
    const index = this.deck.findIndex((s) => !onScreen.has(s.sender));
    return this.deck.splice(Math.max(0, index), 1)[0] ?? SAMPLES[0];
  }

  private fill(env: Envelope, sample: Sample) {
    env.sample = sample;
    env.fields.sender.textContent = sample.sender;
    env.fields.subject.textContent = sample.subject;
    env.fields.time.textContent = sample.time;
    env.button.setAttribute("aria-label", `Unsubscribe from ${sample.sender} (sample)`);
  }

  private launch(env: Envelope, d: number, sample: Sample) {
    this.fill(env, sample);
    env.state = "flow";
    env.d = d;
    // Entering at the lane's own pace, so a newcomer never lurches into place.
    env.v = this.speed();
    env.jitter = rand(-1, 1);
    // A little of each envelope's own lean, on top of what the lane gives it.
    env.tilt = rand(-2.5, 3);
    // Each newcomer lies over the one above it.
    env.seq = ++this.seq;
    env.depth = rand(0.97, 1);
    env.progress = 0;
    env.hover = env.focus = false;
    env.touchUntil = 0;
    env.held = false;
    env.el.removeAttribute("data-held");
    env.el.removeAttribute("data-dissolving");
    env.paper.style.removeProperty("--mr");
    env.shade.style.opacity = "";
    env.el.style.visibility = "";
    env.burst = null;
  }

  private retire(env: Envelope) {
    env.state = "idle";
    env.sample = null;
    env.held = false;
    env.v = 0;
    env.el.removeAttribute("data-held");
    env.el.removeAttribute("data-dissolving");
    env.el.style.visibility = "hidden";
    env.el.style.opacity = "0";
    env.el.style.filter = "";
    env.filter = "";
    env.pose.o = 0;
    this.hideMirror(env);
    this.setInteractive(env, false);
  }

  private setInteractive(env: Envelope, on: boolean) {
    if (on === env.interactive) return;
    // An envelope that is still holding focus stays reachable until it is
    // released, so keyboard users are never dropped mid-way.
    if (!on && env.el.contains(document.activeElement)) return;
    env.interactive = on;
    env.el.inert = !on;
  }

  private speed() {
    return this.narrow ? SPEED_NARROW : SPEED * this.u;
  }

  // --- Layout ----------------------------------------------------------------------

  private measure(first: boolean) {
    const rootRect = this.root.getBoundingClientRect();
    const streamsRect = this.streams.getBoundingClientRect();
    const width = this.streams.clientWidth;
    const height = this.streams.clientHeight;
    if (!width || !height) return;

    const narrow = this.narrowQuery.matches;
    this.width = width;
    this.height = height;
    this.heroTop = rootRect.top + window.scrollY;
    this.offset = { x: streamsRect.left - rootRect.left, y: streamsRect.top - rootRect.top };
    if (this.cta) this.ctaRect = relativeRect(this.cta, rootRect);
    if (this.copy) this.copyRect = relativeRect(this.copy, rootRect);
    this.keepOut = [...this.root.querySelectorAll("[data-hero-text]")].map((el) => relativeRect(el, rootRect));

    // The approved frame scaled as the copy is, so the lanes keep their place
    // beside it whatever the window.
    const u = narrow || !this.copy ? 1 : Math.min(window.innerWidth / REF.width, window.innerHeight / REF.height);
    this.u = u;

    const envW = narrow || !this.copy ? clamp(width * 0.455, 160, 300) : REF.envelope * u;
    const envH = envW * ASPECT;
    // Close ranks, as in the approved frame; when narrow, a little looser.
    const pitch = envH * (narrow || !this.copy ? 1.8 : 1.78);

    for (const lane of this.lanes) {
      if (narrow || !this.copy) {
        // A band under the copy: the same curve, shallower, between the two
        // columns the lanes keep to.
        const bow = envW * 0.12;
        const entry = height + envH * 0.8;
        const half = entry / 2;
        lane.r0 = width * 0.23;
        lane.k = bow / (half * half);
        lane.y0 = half;
        lane.lim = Infinity;
        lane.t0 = -envH * 0.1;
        lane.t1 = envH * 0.8;
        lane.b0 = height - 8;
        lane.b1 = lane.b0 - envH * 0.9;
        lane.entry = entry;
        lane.length = entry + envH;
      } else {
        const rect = this.copyRect!;
        // Envelopes are gone before they reach the header, and before the hint.
        const nav = parseFloat(getComputedStyle(this.root).paddingTop) || 0;
        const hint = this.hint ? relativeRect(this.hint, rootRect).top : height - 114 * u;
        lane.r0 = REF.apex * u;
        lane.k = REF.bow / u;
        lane.lim = REF.reach * u;
        lane.y0 = rect.top + rect.height / 2 - 55 * u + (lane.side === "right" ? 44 * u : 0);
        lane.t0 = nav + 6 * u;
        lane.t1 = nav + 62 * u;
        lane.b0 = hint - 6 * u;
        lane.b1 = lane.b0 - 24 * u;
        lane.entry = lane.b0 + envH * 0.9;
        lane.length = lane.entry - (lane.t0 - envH * 0.5);
      }
      lane.minGap = pitch * 0.95;
    }

    this.reach = narrow ? 0 : REF.glass * u;
    for (const lane of this.lanes) {
      if (!lane.strip) continue;
      lane.strip.style.inlineSize = `${this.reach.toFixed(1)}px`;
      lane.stripX = lane.side === "left" ? 0 : width - this.reach;
    }

    const resized = !this.envW || Math.abs(envW - this.envW) / this.envW > 0.08 || narrow !== this.narrow;
    this.narrow = narrow;
    this.envW = envW;
    this.envH = envH;
    this.pitch = pitch;
    this.streams.style.setProperty("--env-w", `${envW.toFixed(1)}px`);
    this.streams.style.setProperty("--env-h", `${envH.toFixed(1)}px`);

    if (first || resized) this.layOut(first);
    this.sizeCanvas(this.dustCanvas, this.dust, this.root.clientWidth, this.root.clientHeight);
    this.sizeCanvas(this.moteCanvas, this.motes, width, height);
    this.dustDirty = true;
  }

  private sizeCanvas(
    canvas: HTMLCanvasElement | null,
    ctx: CanvasRenderingContext2D | null,
    width: number,
    height: number,
  ) {
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Fills both lanes from top to bottom, the right one a little lower. */
  private layOut(first: boolean) {
    for (const env of this.envs) if (env.state !== "idle") this.retire(env);
    this.deck = [];
    this.shuffleDeck();

    for (const lane of this.lanes) {
      const wide = !this.narrow && !!this.copy;
      const below = lane.side === "left" || wide ? 0 : this.pitch * 0.45;
      const first0 = wide ? lane.y0 - 184 * this.u : lane.t1 + this.envH * 0.7;
      const ys: number[] = [];
      for (let y = first0 + below; y < lane.b0 + this.envH * 0.15; y += this.pitch * rand(0.97, 1.03)) ys.push(y);
      const opening = first ? [...OPENING[lane.side]] : [];
      ys.forEach((y, i) => {
        const env = lane.envs[i];
        if (!env) return;
        this.launch(env, lane.entry - y, opening.shift() ?? this.nextSample());
      });
      lane.gap = this.pitch * rand(0.95, 1.1);
      for (const mote of lane.motes) mote.d = rand(0, lane.length);
    }

    for (const env of this.envs) this.pose(env);
  }

  // --- The lanes' shape ------------------------------------------------------------

  /** Where the lane's centre is, across the hero, at height `y`. */
  private laneX(lane: Lane, y: number) {
    return this.width / 2 - lane.dir * laneOffset(lane, y);
  }

  // --- Simulation ------------------------------------------------------------------

  private step(dt: number) {
    this.now += dt;
    if (this.now - this.colorsAt > 1) this.readColors();
    const speed = this.speed();

    for (const lane of this.lanes) {
      // Top to bottom, each envelope keeps its distance from the one above it:
      // when one is held (or dissolving) the ones behind slow smoothly to a
      // stop a gap away instead of piling onto it, and set off again as it
      // lets go. A lane with room between two envelopes closes it up gently.
      const order = lane.order;
      order.length = 0;
      for (const env of lane.envs) if (env.state !== "idle") order.push(env);
      order.sort((a, b) => b.d - a.d);

      let lowest = Infinity;
      let ahead: Envelope | null = null;
      for (const env of order) {
        if (env.state === "flow") this.syncHeld(env);
        let want = env.state === "dissolve" || this.wantsHold(env) ? 0 : speed;
        if (want && ahead) {
          const free = ahead.d - env.d - lane.minGap;
          want *= 1 + 0.3 * smooth((free - 0.35 * this.pitch) / (1.1 * this.pitch));
          want = Math.min(want, Math.max(0, free) / FOLLOW);
        }
        env.v += (want - env.v) * (1 - Math.exp(-dt * EASE));
        env.d += env.v * dt;

        let gone = false;
        if (env.state === "dissolve") gone = this.stepDissolve(env, dt);
        else if (env.d > lane.length) {
          this.retire(env);
          gone = true;
        }
        if (!gone) {
          lowest = Math.min(lowest, env.d);
          ahead = env;
        }
      }

      // A new envelope enters, below sight, once the last one has risen a
      // pitch above the entry point.
      if (lowest === Infinity || lowest >= lane.gap) {
        const env = lane.envs.find((e) => e.state === "idle");
        if (env) {
          const slot = lowest === Infinity ? 0 : lowest - lane.gap;
          const unseen = lane.entry - lane.b0;
          this.launch(env, slot <= unseen ? Math.max(0, slot) : 0, this.nextSample());
          lane.gap = this.pitch * rand(0.95, 1.12);
        }
      }

      for (const mote of lane.motes) {
        mote.d += speed * mote.v * dt;
        if (mote.d > lane.length) mote.d -= lane.length;
      }
    }

    this.stepLight(dt);
    this.stepDust(dt);
  }

  private pose(env: Envelope) {
    const lane = env.lane;
    const y = lane.entry - env.d;
    const pose = env.pose;
    pose.y = y;
    pose.x = this.laneX(lane, y) + env.jitter * this.envW * 0.03;
    // Tipped as in the approved frame and turned by the lane's slope.
    pose.r = paperTilt(lane.dir, laneLean(lane, y), env.tilt) * (this.narrow ? 0.6 : 1);
    pose.k = env.depth;
    // How far the tilted paper reaches up and down from its centre.
    const rad = (pose.r * Math.PI) / 180;
    const half = ((this.envW * Math.abs(Math.sin(rad)) + this.envH * Math.abs(Math.cos(rad))) * pose.k) / 2;
    if (!this.narrow) {
      const hx = ((this.envW * Math.abs(Math.cos(rad)) + this.envH * Math.abs(Math.sin(rad))) * pose.k) / 2;
      // Ease the extreme corner of an entering envelope away from the copy.
      // This guard includes its own lean/jitter; the nominal lane alone cannot.
      pose.x = protectLaneX(
        pose.x + this.offset.x, y + this.offset.y, hx, half,
        lane.dir, this.keepOut, 12 * this.u, 24 * this.u,
      ) - this.offset.x;
    }
    pose.o = this.fade(lane, y, half);
  }

  /**
   * Fades out before the paper's top edge reaches the header (or the top of
   * the band, when narrow), and in only once its lower edge is clear of the
   * hint. Measured from the paper's own edge, not its centre, so a tilted one
   * is gone in time too.
   */
  private fade(lane: Lane, y: number, half: number) {
    return edgeFade(y - half, y + half, lane.t0, lane.t1, lane.b0, lane.b1);
  }

  // --- Glass ------------------------------------------------------------------------

  /** Moves the glass's light towards where the pointer and the scroll put it. */
  private stepLight(dt: number) {
    const l = this.light;
    const a = 1 - Math.exp(-dt * 4);
    l.x += (l.tx - l.x) * a;
    l.y += (l.ty - l.y) * a;
    l.s += (l.ts - l.s) * a;
    const still =
      Math.abs(l.tx - l.x) + Math.abs(l.ty - l.y) + Math.abs(l.ts - l.s) < 0.0005 && l.applied;
    if (still) return;
    l.applied = true;
    const u = this.u;
    for (const layer of this.layers) {
      // The glass sits behind the paper: it moves a little against the pointer
      // and slower than the page, its light a little with it.
      const k = layer.depth;
      const sign = layer.sign;
      const x = (layer.light ? 26 : -5) * l.x * k * u * sign;
      const y = (layer.light ? 30 : -7) * l.y * k * u + (layer.light ? -22 : 16) * l.s * k * u;
      layer.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    }
    const lift = `translate3d(0, ${(16 * l.s * u).toFixed(2)}px, 0)`;
    for (const lane of this.lanes) if (lane.strip) lane.strip.style.transform = lift;
  }

  /**
   * An envelope's reflection and the light it casts. Near the glass (the lane
   * bows towards it at mid-height) the paper is mirrored in the surface at its
   * outer edge: same position and tilt, flipped, squeezed by the curve of the
   * glass, softened. It strengthens as the envelope nears the glass, fades as
   * it leaves or dissolves, and is hidden once there is nothing to reflect.
   */
  private reflect(env: Envelope) {
    const { mirror, glow, lane } = env;
    if (!mirror || !glow) return;
    if (this.narrow || !this.reach || env.state === "idle") return this.hideMirror(env);

    const { x, y, r, k, o } = env.pose;
    const rad = (r * Math.PI) / 180;
    // How far the tilted paper reaches sideways from its centre.
    const hx = ((this.envW * Math.abs(Math.cos(rad)) + this.envH * Math.abs(Math.sin(rad))) * k) / 2;
    const edge = lane.dir > 0 ? x - hx : x + hx;
    const away = lane.dir > 0 ? edge : this.width - edge;
    const contact = REF.contact * this.u;
    // 1 with the paper at the glass, 0 once it is a full depth of glass away.
    const near = 1 - smooth((away - contact) / Math.max(1, this.reach - contact));
    let live = o;
    if (env.state === "dissolve") live *= clamp(1 - env.progress * 1.5);
    const a = near * live;
    if (a < 0.01) return this.hideMirror(env);

    const u = this.u;
    // The mirror stands just outside the paper's edge, closer as it comes near.
    const gap = (3 + 12 * (1 - near)) * u;
    const axis = lane.dir > 0 ? edge - gap : edge + gap;
    // A curved surface squeezes what it reflects sideways, more at a graze.
    const sx = 0.44 + 0.12 * (1 - near);
    const sy = 1.12 + 0.08 * (1 - near);
    const cx = axis - sx * (x - axis) - lane.stripX;
    const blur = (3.2 + 2.8 * (1 - near)) * u;

    if (!env.mirrored) {
      env.mirrored = true;
      mirror.style.visibility = "visible";
      glow.style.visibility = "visible";
    }
    mirror.style.opacity = (a * MIRROR).toFixed(3);
    mirror.style.filter = `blur(${blur.toFixed(1)}px)`;
    mirror.style.transform =
      `translate(${(cx - this.envW / 2).toFixed(2)}px, ${(y - this.envH / 2).toFixed(2)}px) ` +
      `scale(${(-sx).toFixed(3)}, ${sy.toFixed(3)}) rotate(${r.toFixed(2)}deg) scale(${k.toFixed(3)})`;

    // Its light on the glass beside it, a little inside the surface.
    const gw = this.envW * 0.5;
    const gh = this.envW * 0.95;
    const gx = axis - lane.dir * (10 * u) - lane.stripX;
    glow.style.opacity = (near * near * live * SPEC).toFixed(3);
    glow.style.transform = `translate(${(gx - gw / 2).toFixed(2)}px, ${(y - gh / 2).toFixed(2)}px)`;
  }

  private hideMirror(env: Envelope) {
    if (!env.mirrored || !env.mirror || !env.glow) return;
    env.mirrored = false;
    env.mirror.style.visibility = "hidden";
    env.mirror.style.opacity = "0";
    env.glow.style.visibility = "hidden";
    env.glow.style.opacity = "0";
  }

  // --- Unsubscribe -------------------------------------------------------------------

  private unsubscribe(env: Envelope) {
    if (env.state !== "flow") return;

    if (env.el.contains(document.activeElement)) this.passFocus(env);
    env.state = "dissolve";
    env.held = false;
    env.el.removeAttribute("data-held");

    if (!this.animate) {
      // Reduced motion: no scattering, just a quiet fade and the CTA's nod.
      this.setInteractive(env, false);
      env.el.style.opacity = "0";
      this.hideMirror(env);
      this.later(() => this.pulse(), 320);
      this.later(() => {
        const d = env.d;
        this.launch(env, d, this.nextSample());
        this.pose(env);
        this.place(env);
      }, 1400);
      return;
    }

    const w = this.envW;
    const h = this.envH;
    const b = env.button;
    env.ox = b.offsetLeft + b.offsetWidth / 2;
    env.oy = b.offsetTop + b.offsetHeight / 2;
    env.rMax = Math.max(
      Math.hypot(env.ox, env.oy),
      Math.hypot(w - env.ox, env.oy),
      Math.hypot(env.ox, h - env.oy),
      Math.hypot(w - env.ox, h - env.oy),
    ) + w * BAND;
    env.t = 0;
    env.r = 0;
    env.carry = 0;
    env.progress = 0;
    const expected = Math.round(DUST_PER_ENVELOPE * clamp((w * h) / (400 * 400 * ASPECT), 0.5, 1));
    if (this.cta) this.ctaRect = relativeRect(this.cta, this.root.getBoundingClientRect());
    env.burst = { expected, arrived: 0, pulsed: false, ...this.route(env) };
    env.paper.style.setProperty("--mx", `${env.ox.toFixed(1)}px`);
    env.paper.style.setProperty("--my", `${env.oy.toFixed(1)}px`);
    env.paper.style.setProperty("--mr", "0px");
    env.el.setAttribute("data-dissolving", "");
    this.setInteractive(env, false);
    this.burstAtControl(env);
  }

  /**
   * The first storyboard frame: a dense cloud bursting off the paper around
   * the control the moment it is used, before the erosion has spread.
   */
  private burstAtControl(env: Envelope) {
    const burst = env.burst;
    if (!burst) return;
    const pose = env.pose;
    const rad = (pose.r * Math.PI) / 180;
    const cos = Math.cos(rad) * pose.k;
    const sin = Math.sin(rad) * pose.k;
    const reach = this.envW * BAND * 1.4;
    const count = Math.round(burst.expected * 0.28);
    for (let i = 0; i < count && this.alive < MAX_DUST; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * reach;
      const cx = env.ox + Math.cos(a) * rr - this.envW / 2;
      const cy = env.oy + Math.sin(a) * rr - this.envH / 2;
      const x = pose.x + cx * cos - cy * sin + this.offset.x;
      const y = pose.y + cx * sin + cy * cos + this.offset.y;
      this.spawnParticle({ x, y }, Math.cos(a), Math.sin(a), burst);
    }
  }

  /** Keeps keyboard focus in the lanes when the focused envelope goes. */
  private passFocus(env: Envelope) {
    const next = env.lane.envs
      .filter((e) => e !== env && e.state === "flow" && e.interactive)
      .sort((a, b) => Math.abs(a.d - env.d) - Math.abs(b.d - env.d))[0];
    (next?.button ?? this.cta)?.focus({ preventScroll: true });
  }

  /** Advances a dissolve; true once the envelope is gone. */
  private stepDissolve(env: Envelope, dt: number): boolean {
    env.t += dt;
    // A steady front, easing only at its ends, so the paper is visibly eaten
    // across rather than vanishing in the middle of the move.
    const t = clamp(env.t / DISSOLVE);
    const progress = (t + easeInOut(t)) / 2;
    env.progress = progress;
    const r0 = env.r;
    env.r = progress * env.rMax;
    this.emit(env, r0, env.r);
    env.paper.style.setProperty("--mr", `${env.r.toFixed(1)}px`);
    // The shadow goes with the paper it belongs to, ahead of the last crumbs.
    env.shade.style.opacity = String(clamp(1 - progress * 1.8));
    if (env.t < DISSOLVE) return false;
    this.retire(env);
    return true;
  }

  /** Sheds dust from the ring the dissolve has just swept. */
  private emit(env: Envelope, r0: number, r1: number) {
    const burst = env.burst;
    if (!burst || r1 <= r0) return;
    const w = this.envW;
    const h = this.envH;
    const ringArea = Math.PI * (r1 * r1 - r0 * r0);
    env.carry += (burst.expected * ringArea) / (w * h);
    const tries = Math.floor(env.carry);
    env.carry -= tries;

    const pose = env.pose;
    const rad = (pose.r * Math.PI) / 180;
    const cos = Math.cos(rad) * pose.k;
    const sin = Math.sin(rad) * pose.k;

    for (let i = 0; i < tries; i++) {
      if (this.alive >= MAX_DUST) return;
      const a = Math.random() * Math.PI * 2;
      // Off the crumbling band just outside the advancing edge.
      const rr = Math.sqrt(r0 * r0 + Math.random() * (r1 * r1 - r0 * r0)) + w * BAND * rand(0.1, 0.7);
      const lx = env.ox + Math.cos(a) * rr;
      const ly = env.oy + Math.sin(a) * rr;
      if (lx < 0 || lx > w || ly < 0 || ly > h) continue;
      const cx = lx - w / 2;
      const cy = ly - h / 2;
      const x = pose.x + cx * cos - cy * sin + this.offset.x;
      const y = pose.y + cx * sin + cy * cos + this.offset.y;
      this.spawnParticle({ x, y }, Math.cos(a), Math.sin(a), burst);
    }
  }

  /**
   * The route a dissolve's dust takes to the CTA: down the inside of its lane
   * (or, when narrow, up a column beside the button), then into the lower
   * corner of the button on its own side. Built from the control's position,
   * where the erosion starts.
   */
  private route(env: Envelope): { p1: Point; p2: Point; p3: Point; dir: 1 | -1 } {
    const cta = this.ctaRect ?? { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    const dir = env.lane.dir;
    const ch = cta.height;
    const edge = dir > 0 ? cta.left : cta.right;
    const maxX = this.root.clientWidth - 6;
    const pose = env.pose;
    const rad = (pose.r * Math.PI) / 180;
    const lx = (env.ox - this.envW / 2) * pose.k;
    const ly = (env.oy - this.envH / 2) * pose.k;
    const start = {
      x: pose.x + lx * Math.cos(rad) - ly * Math.sin(rad) + this.offset.x,
      y: pose.y + lx * Math.sin(rad) + ly * Math.cos(rad) + this.offset.y,
    };
    // Into the end of the button on the stream's own side, a little below
    // its middle.
    const p3 = { x: edge + dir * ch * 0.35, y: cta.top + ch * 0.58 };

    if (this.narrow) {
      const outer = Math.max(6, Math.min(maxX, edge - dir * ch));
      return {
        p1: { x: outer, y: start.y + (cta.bottom - start.y) * 0.6 },
        p2: { x: outer, y: p3.y + ch * 0.3 },
        p3,
        dir,
      };
    }
    // A long, gently sagging arc through the space beside and below the
    // description, arriving almost level with the button.
    const p2 = { x: Math.max(6, Math.min(maxX, edge - dir * ch * 1.5)), y: p3.y + ch * 0.12 };
    let p1 = { x: start.x + (p2.x - start.x) * 0.35, y: start.y + (p3.y - start.y) * 0.8 + ch * 0.6 };
    // Never above the button while over the copy.
    const copy = this.copyRect;
    if (copy && (dir > 0 ? p1.x > copy.left : p1.x < copy.right)) p1 = { x: p1.x, y: Math.max(p1.y, cta.top) };
    return { p1, p2, p3, dir };
  }

  private spawnParticle(p0: Point, ux: number, uy: number, burst: Burst) {
    const cta = this.ctaRect;
    if (!cta) return;
    let particle = this.particles.find((p) => !p.alive);
    if (!particle) {
      particle = {
        alive: false,
        p0: { x: 0, y: 0 },
        p1: { x: 0, y: 0 },
        p2: { x: 0, y: 0 },
        p3: { x: 0, y: 0 },
        puff: { x: 0, y: 0 },
        noise: { x: 0, y: 0 },
        age: 0,
        dur: 0,
        size: 0,
        alpha: 0,
        light: false,
        wobble: 0,
        seed: 0,
        arrived: false,
        burst,
      };
      this.particles.push(particle);
    }

    // Each grain joins its burst's route near the start and keeps to it, so
    // the dust converges into one stream instead of drifting as a cloud.
    const ch = cta.height;
    const p1 = { x: burst.p1.x + rand(-14, 14), y: burst.p1.y + rand(-14, 14) };
    const p2 = { x: burst.p2.x + rand(-6, 6), y: burst.p2.y + rand(-5, 5) };
    const p3 = { x: burst.p3.x + rand(-0.12, 0.12) * ch, y: burst.p3.y + rand(-0.1, 0.1) * ch };

    particle.alive = true;
    particle.p0 = p0;
    particle.p1 = p1;
    particle.p2 = p2;
    particle.p3 = p3;
    // First a cloud bursting off the paper towards the copy; it then draws in
    // to the stream.
    const puff = rand(6, 26);
    particle.puff = { x: ux * puff + burst.dir * rand(2, 12), y: uy * puff * 0.8 };
    const spread = rand(4, 16);
    const na = rand(0, Math.PI * 2);
    particle.noise = { x: Math.cos(na) * spread, y: Math.sin(na) * spread };
    particle.age = 0;
    particle.dur = rand(1.7, 2.3);
    particle.size = Math.random() < 0.12 ? rand(1.8, 3) : rand(0.6, 1.6);
    particle.alpha = rand(0.45, 0.95);
    particle.light = Math.random() < 0.35;
    particle.wobble = rand(1.5, 3);
    particle.seed = rand(0, 10);
    particle.arrived = false;
    particle.burst = burst;
    this.alive++;
  }

  private stepDust(dt: number) {
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.age += dt;
      const t = p.age / p.dur;
      if (!p.arrived && t >= 0.86) {
        p.arrived = true;
        const burst = p.burst;
        burst.arrived++;
        if (!burst.pulsed && burst.arrived >= Math.max(6, burst.expected * 0.12)) {
          burst.pulsed = this.pulse();
        }
      }
      if (t >= 1) {
        p.alive = false;
        this.alive--;
      }
    }
  }

  /**
   * The CTA's answer to arriving dust: a fine outline and a tiny lift. Arrivals
   * that overlap extend one pulse (up to a limit) instead of stacking, and a
   * short rest follows. Returns false if it was resting, so the caller retries.
   */
  private pulse(): boolean {
    const cta = this.cta;
    if (!cta) return true;
    const t = performance.now();
    if (!this.pulseOn && t < this.pulseCooldown) return false;
    if (!this.pulseOn) {
      this.pulseOn = true;
      this.pulseSince = t;
      this.pulseOff = t + 460;
      cta.setAttribute("data-dust", "");
    } else {
      this.pulseOff = Math.min(this.pulseSince + 1000, Math.max(this.pulseOff, t + 300));
    }
    clearTimeout(this.pulseTimer);
    this.pulseTimer = window.setTimeout(() => {
      this.pulseOn = false;
      this.pulseCooldown = performance.now() + 380;
      cta.removeAttribute("data-dust");
    }, this.pulseOff - t);
    return true;
  }

  // --- Drawing ---------------------------------------------------------------------

  private readColors() {
    this.colorsAt = this.now;
    const style = getComputedStyle(this.root);
    this.colors = {
      dust: style.getPropertyValue("--hero-dust").trim() || "#111",
      dust2: style.getPropertyValue("--hero-dust-2").trim() || "#888",
      mote: style.getPropertyValue("--hero-mote").trim() || "#111",
    };
  }

  private render() {
    for (const env of this.envs) {
      if (env.state === "idle") continue;
      this.pose(env);
      this.place(env);
    }
    this.drawMotes();
    this.drawDust();
  }

  private place(env: Envelope) {
    const { x, y, r, k, o } = env.pose;
    const el = env.el;
    // Keep fully visible foreground free of blur and use 2D movement. Browser
    // compositing and text quality are verified visually, not inferred here.
    el.style.transform =
      `translate(${(x - this.envW / 2).toFixed(2)}px, ${(y - this.envH / 2).toFixed(2)}px) ` +
      `rotate(${r.toFixed(2)}deg) scale(${k.toFixed(3)})`;
    if (this.animate || env.state === "flow") {
      el.style.opacity = o >= 0.995 ? "" : o.toFixed(3);
      // Coming in and going out, an envelope is out of focus as well as faint.
      const blur = o >= 0.995 ? 0 : (1 - o) * 4.5 * (this.narrow ? 0.5 : this.u);
      const filter = blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : "";
      if (filter !== env.filter) {
        env.filter = filter;
        el.style.filter = filter;
      }
    }
    const z = env.state === "dissolve" || env.held ? 100000 : 10 + (env.seq % 50000);
    if (z !== env.z) {
      env.z = z;
      el.style.zIndex = String(z);
    }
    if (env.state === "flow") this.setInteractive(env, o > 0.45);
    this.reflect(env);
  }

  private drawMotes() {
    const ctx = this.motes;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = this.colors.mote;
    ctx.strokeStyle = this.colors.mote;
    ctx.lineWidth = 0.8;
    const spread = this.envW * 0.7;
    for (const lane of this.lanes) {
      for (const mote of lane.motes) {
        const y = lane.entry - mote.d;
        const o = this.fade(lane, y, this.envH * 0.6) * mote.alpha;
        if (o <= 0.01) continue;
        const x = this.laneX(lane, y) + mote.off * spread;
        // A grain rising, some trailing a faint thread below them that follows
        // the lane's curve.
        if (mote.line) {
          const tail = 26 + mote.size * 28;
          ctx.globalAlpha = o * 0.34;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (this.laneX(lane, y + tail) - this.laneX(lane, y)), y + tail);
          ctx.stroke();
        }
        ctx.globalAlpha = o;
        ctx.beginPath();
        ctx.arc(x, y, mote.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Where a grain is at a given age along its route. */
  private at(p: Particle, age: number, out: Point) {
    const t = clamp(age / p.dur);
    // Off the paper at once, slowing as it reaches the button.
    const e = 1 - Math.pow(1 - t, 2.2);
    const u = 1 - e;
    const b0 = u * u * u;
    const b1 = 3 * u * u * e;
    const b2 = 3 * u * e * e;
    const b3 = e * e * e;
    const burst = Math.sin(Math.min(1, t * 3) * (Math.PI / 2)) * u * u;
    // Wide near the paper, narrowing to a fine stream at the button.
    const drift = Math.pow(u, 1.5) * Math.min(1, t * 4);
    const wobble = Math.sin(age * p.wobble + p.seed) * 1.5 * u;
    out.x = b0 * p.p0.x + b1 * p.p1.x + b2 * p.p2.x + b3 * p.p3.x + p.puff.x * burst + p.noise.x * drift + wobble;
    out.y = b0 * p.p0.y + b1 * p.p1.y + b2 * p.p2.y + b3 * p.p3.y + p.puff.y * burst + p.noise.y * drift;
    this.clearText(out);
  }

  /** Moves a grain that has strayed into the headline or the description out
      through the nearest edge above or below it. */
  private clearText(p: Point) {
    for (const r of this.keepOut) {
      if (p.x < r.left - 6 || p.x > r.right + 6 || p.y < r.top - 4 || p.y > r.bottom + 4) continue;
      p.y = p.y > (r.top + r.bottom) / 2 ? r.bottom + 5 : r.top - 5;
    }
  }

  private drawDust() {
    const ctx = this.dust;
    if (!ctx) return;
    if (!this.alive && !this.dustDirty) return;
    ctx.clearRect(0, 0, this.root.clientWidth, this.root.clientHeight);
    this.dustDirty = this.alive > 0;
    const here: Point = { x: 0, y: 0 };
    const behind: Point = { x: 0, y: 0 };
    for (const light of [false, true]) {
      ctx.fillStyle = light ? this.colors.dust2 : this.colors.dust;
      for (const p of this.particles) {
        if (!p.alive || p.light !== light) continue;
        const t = clamp(p.age / p.dur);
        this.at(p, p.age, here);
        this.at(p, Math.max(0, p.age - 0.05), behind);
        // In quickly, then shrinking and fading as it enters the button.
        const end = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
        const e = 1 - Math.pow(1 - t, 2.2);
        const s = p.size * (0.45 + 0.55 * (1 - e)) * (0.2 + 0.8 * end);
        const alpha = p.alpha * Math.min(1, t * 25) * end;
        // A faint grain just behind, so moving dust reads as a stream.
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillRect((here.x + behind.x) / 2 - s / 2, (here.y + behind.y) / 2 - s / 2, s, s);
        ctx.globalAlpha = alpha;
        ctx.fillRect(here.x - s / 2, here.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }
}
