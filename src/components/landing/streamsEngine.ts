/**
 * The landing hero's envelope streams: what is shown, and how it moves.
 *
 * Two side lanes of folded paper envelopes drift upward beside the centred
 * copy. Hovering or focusing one holds it still and reveals its Unsubscribe
 * control; activating that dissolves the whole envelope into fine dust that
 * curves through the free space into the lower corner of the Try the demo
 * button, which answers with a small grayscale pulse. Nothing navigates.
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

export type Side = "left" | "right";
export type Sample = { sender: string; subject: string; time: string };

/** The first envelopes on screen, top to bottom, as in the approved design. */
export const OPENING: Record<Side, Sample[]> = {
  left: [
    { sender: "Weekly Offers", subject: "New deals every week", time: "Tue" },
    { sender: "Daily Deals", subject: "Huge savings just for you", time: "10:24 AM" },
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
export const POOL_PER_SIDE = 9;

/** Envelope height as a share of its width. */
export const ASPECT = 0.38;

/** Below this width the lanes move under the copy (matches page.module.css). */
const NARROW = "(max-width: 64rem)";

const SPEED = 22; // px per second, desktop
const SPEED_NARROW = 17;
const DISSOLVE = 1.15; // seconds for an envelope to come apart
const DUST_PER_ENVELOPE = 240;
const MAX_DUST = 1800;
const MOTES_PER_LANE = 20;
/** Gap between the copy and the inner edge of a lane. */
const COPY_GAP = 24;

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

type Burst = { expected: number; arrived: number; pulsed: boolean };

type Envelope = {
  el: HTMLElement;
  paper: HTMLElement;
  shade: HTMLElement;
  button: HTMLButtonElement;
  fields: { sender: HTMLElement; subject: HTMLElement; time: HTMLElement };
  lane: Lane;
  state: "idle" | "flow" | "dissolve";
  sample: Sample | null;
  /** Distance risen from the lane's entry point. */
  d: number;
  jitter: number;
  tilt: number;
  depth: number;
  seed: number;
  /** 0 moving freely … 1 held still. */
  hold: number;
  hover: boolean;
  focus: boolean;
  touchUntil: number;
  // Dissolving
  t: number;
  ox: number;
  oy: number;
  r: number;
  rMax: number;
  carry: number;
  burst: Burst | null;
  pose: Pose;
  interactive: boolean;
  held: boolean;
  z: number;
};

type Mote = { off: number; d: number; v: number; line: boolean; size: number; alpha: number };

type Lane = {
  side: Side;
  /** +1 for the left lane (the copy is to its right), -1 for the right. */
  dir: 1 | -1;
  cx: number;
  top: number;
  bottom: number;
  entry: number;
  length: number;
  gap: number;
  flip: boolean;
  envs: Envelope[];
  motes: Mote[];
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

// --- The scene --------------------------------------------------------------------

/**
 * Starts the streams inside `root` (the hero section) and returns a function
 * that stops them and removes every listener.
 *
 * With `animate` false the lanes are laid out once and stay still; an
 * unsubscribe then fades the envelope away instead of scattering it.
 */
export function startHeroStreams(root: HTMLElement, animate: boolean): () => void {
  const streams = root.querySelector<HTMLElement>("[data-streams]");
  if (!streams) return () => {};
  return new Streams(root, streams, animate).stop;
}

class Streams {
  private copy: HTMLElement | null;
  private cta: HTMLElement | null;
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
  private envW = 0;
  private envH = 0;
  private pitch = 0;
  private offset: Point = { x: 0, y: 0 };
  private ctaRect: Rect | null = null;
  private colors = { dust: "#111", dust2: "#888", mote: "#111" };
  private colorsAt = -1;

  private now = 0;
  private last = 0;
  private frame = 0;
  private running = false;
  private inView = true;
  private deck: Sample[] = [];

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
    this.dustCanvas = root.querySelector("canvas[data-dust]");
    this.moteCanvas = streams.querySelector("canvas[data-motes]");
    this.dust = this.dustCanvas?.getContext("2d") ?? null;
    this.motes = this.moteCanvas?.getContext("2d") ?? null;

    for (const side of ["left", "right"] as const) {
      const lane: Lane = {
        side,
        dir: side === "left" ? 1 : -1,
        cx: 0,
        top: 0,
        bottom: 0,
        entry: 0,
        length: 1,
        gap: 0,
        flip: side === "right",
        envs: [],
        motes: Array.from({ length: MOTES_PER_LANE }, (_, i) => ({
          off: rand(-1, 1),
          d: 0,
          v: rand(0.75, 1.25),
          line: i % 3 === 0,
          size: rand(0.8, 2.3),
          alpha: rand(0.25, 0.85),
        })),
      };
      const els = streams.querySelectorAll<HTMLElement>(`[data-env][data-side="${side}"]`);
      for (const el of els) lane.envs.push(this.adopt(el, lane));
      this.lanes.push(lane);
      this.envs.push(...lane.envs);
    }

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

  private adopt(el: HTMLElement, lane: Lane): Envelope {
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
      lane,
      state: "idle",
      sample: null,
      d: 0,
      jitter: 0,
      tilt: 0,
      depth: 1,
      seed: rand(0, 10),
      hold: 0,
      hover: false,
      focus: false,
      touchUntil: 0,
      t: 0,
      ox: 0,
      oy: 0,
      r: 0,
      rMax: 0,
      carry: 0,
      burst: null,
      pose: { x: 0, y: 0, r: 0, k: 1, o: 0 },
      // Rendered inert; placement makes it reachable once it is visible.
      interactive: false,
      held: false,
      z: 0,
    };

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
    const lane = env.lane;
    this.fill(env, sample);
    env.state = "flow";
    env.d = d;
    env.jitter = rand(-1, 1);
    lane.flip = !lane.flip;
    env.tilt = (lane.flip ? rand(7, 15) : rand(-9, -3)) * (this.narrow ? 0.6 : 1);
    env.depth = rand(0.94, 1);
    env.hold = 0;
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
    env.el.removeAttribute("data-held");
    env.el.removeAttribute("data-dissolving");
    env.el.style.visibility = "hidden";
    env.el.style.opacity = "0";
    env.pose.o = 0;
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

  // --- Layout ----------------------------------------------------------------------

  private measure(first: boolean) {
    const rootRect = this.root.getBoundingClientRect();
    const streamsRect = this.streams.getBoundingClientRect();
    const width = this.streams.clientWidth;
    const height = this.streams.clientHeight;
    if (!width || !height) return;

    const narrow = this.narrowQuery.matches;
    this.offset = { x: streamsRect.left - rootRect.left, y: streamsRect.top - rootRect.top };
    if (this.cta) this.ctaRect = relativeRect(this.cta, rootRect);

    let envW: number;
    if (narrow || !this.copy) {
      envW = clamp(width * 0.48, 170, 300);
      this.lanes[0].cx = width * 0.26;
      this.lanes[1].cx = width * 0.74;
      for (const lane of this.lanes) lane.top = 0;
    } else {
      const copy = relativeRect(this.copy, streamsRect);
      const gutter = clamp(width * 0.034, 16, 56);
      const free = Math.min(copy.left, width - copy.right) - COPY_GAP - gutter;
      envW = clamp(free / 1.32, 170, 400);
      this.lanes[0].cx = copy.left - COPY_GAP - envW * 0.68;
      this.lanes[1].cx = copy.right + COPY_GAP + envW * 0.68;
      // Envelopes are gone before they reach the header.
      const nav = parseFloat(getComputedStyle(this.root).paddingTop) || 0;
      for (const lane of this.lanes) lane.top = nav + 12 - (streamsRect.top - rootRect.top);
    }

    const envH = envW * ASPECT;
    for (const lane of this.lanes) {
      lane.bottom = height;
      lane.entry = height + envH * 0.8;
      lane.length = lane.entry - (lane.top - envH);
    }

    const resized = !this.envW || Math.abs(envW - this.envW) / this.envW > 0.08 || narrow !== this.narrow;
    this.narrow = narrow;
    this.envW = envW;
    this.envH = envH;
    this.pitch = envH * (narrow ? 1.55 : 1.72);
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

  /** Fills both lanes from top to bottom, offset so they never move in step. */
  private layOut(first: boolean) {
    for (const env of this.envs) if (env.state !== "idle") this.retire(env);
    this.deck = [];
    this.shuffleDeck();

    for (const lane of this.lanes) {
      const visible = lane.entry - lane.top - this.envH * 0.7;
      const start = this.pitch * (lane.side === "left" ? 0.45 : 0.95);
      const ds: number[] = [];
      for (let d = start; d < visible; d += this.pitch * rand(0.92, 1.08)) ds.push(d);
      ds.reverse();
      const opening = first ? [...OPENING[lane.side]] : [];
      ds.forEach((d, i) => {
        const env = lane.envs[i];
        if (!env) return;
        this.launch(env, d, opening.shift() ?? this.nextSample());
      });
      lane.gap = this.pitch * rand(0.9, 1.1);
      for (const mote of lane.motes) mote.d = rand(0, lane.length);
    }

    for (const env of this.envs) this.pose(env);
  }

  // --- Simulation ------------------------------------------------------------------

  private step(dt: number) {
    this.now += dt;
    if (this.now - this.colorsAt > 1) this.readColors();
    const speed = this.narrow ? SPEED_NARROW : SPEED;

    for (const lane of this.lanes) {
      let lowest = Infinity;
      for (const env of lane.envs) {
        if (env.state === "idle") continue;
        const target = env.state === "dissolve" || this.wantsHold(env) ? 1 : 0;
        env.hold += (target - env.hold) * (1 - Math.exp(-dt * 7));
        if (env.state === "flow" && env.held && !target) this.syncHeld(env);
        env.d += speed * dt * (1 - env.hold);
        let gone: boolean;
        if (env.state === "dissolve") gone = this.stepDissolve(env, dt);
        else if ((gone = env.d > lane.length)) this.retire(env);
        if (!gone) lowest = Math.min(lowest, env.d);
      }

      // A new envelope enters once the last one has risen a pitch above it.
      if (lowest === Infinity || lowest >= lane.gap) {
        const env = lane.envs.find((e) => e.state === "idle");
        if (env) {
          this.launch(env, lowest === Infinity ? 0 : Math.max(0, lowest - lane.gap), this.nextSample());
          lane.gap = this.pitch * rand(0.9, 1.12);
        }
      }

      for (const mote of lane.motes) {
        mote.d += speed * mote.v * dt;
        if (mote.d > lane.length) mote.d -= lane.length;
      }
    }

    this.stepDust(dt);
  }

  private pose(env: Envelope) {
    const lane = env.lane;
    const p = clamp(env.d / lane.length);
    const bow = this.envW * (this.narrow ? 0.04 : 0.07);
    const pose = env.pose;
    pose.y = lane.entry - env.d;
    pose.x = lane.cx - lane.dir * bow * Math.sin(Math.PI * p) + env.jitter * this.envW * 0.06;
    pose.r = env.tilt + 2.2 * Math.sin(p * Math.PI * 1.4 + env.seed);
    pose.k = env.depth;
    pose.o = this.fade(lane, pose.y);
  }

  /** Fades out before the header (or the copy, when narrow) and in at the foot. */
  private fade(lane: Lane, y: number) {
    const h = this.envH;
    const top = smooth((y - h * 0.62 - lane.top) / (h * 0.9));
    const bottom = smooth((lane.bottom - 40 - y) / (h * 0.9));
    return Math.min(top, bottom);
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
    ) + h * 0.3;
    env.t = 0;
    env.r = 0;
    env.carry = 0;
    const expected = Math.round(DUST_PER_ENVELOPE * clamp((w * h) / (400 * 400 * ASPECT), 0.5, 1));
    env.burst = { expected, arrived: 0, pulsed: false };
    env.paper.style.setProperty("--mx", `${env.ox.toFixed(1)}px`);
    env.paper.style.setProperty("--my", `${env.oy.toFixed(1)}px`);
    env.paper.style.setProperty("--mr", "0px");
    env.el.setAttribute("data-dissolving", "");
    this.setInteractive(env, false);
    if (this.cta) this.ctaRect = relativeRect(this.cta, this.root.getBoundingClientRect());
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
    const progress = easeInOut(env.t / DISSOLVE);
    const r0 = env.r;
    env.r = progress * env.rMax;
    this.emit(env, r0, env.r);
    env.paper.style.setProperty("--mr", `${env.r.toFixed(1)}px`);
    env.shade.style.opacity = String(1 - progress);
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
      const rr = Math.sqrt(r0 * r0 + Math.random() * (r1 * r1 - r0 * r0));
      const lx = env.ox + Math.cos(a) * rr;
      const ly = env.oy + Math.sin(a) * rr;
      if (lx < 0 || lx > w || ly < 0 || ly > h) continue;
      const cx = lx - w / 2;
      const cy = ly - h / 2;
      const x = pose.x + cx * cos - cy * sin + this.offset.x;
      const y = pose.y + cx * sin + cy * cos + this.offset.y;
      this.spawnParticle({ x, y }, Math.cos(a), Math.sin(a), env.lane.dir, burst);
    }
  }

  private spawnParticle(p0: Point, ux: number, uy: number, dir: 1 | -1, burst: Burst) {
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

    // Into the lower corner of the CTA on the side the dust comes from.
    const ch = cta.height;
    const edge = dir > 0 ? cta.left : cta.right;
    const p3 = { x: edge + dir * (ch * 0.3 + rand(0, ch * 0.6)), y: cta.top + ch * rand(0.45, 0.92) };
    const maxX = this.root.clientWidth - 6;
    let p1: Point;
    let p2: Point;
    if (this.narrow) {
      // Rising from the band below: up a column outside the button and its
      // note, then in from the side.
      const outer = Math.max(6, Math.min(maxX, edge - dir * ch * rand(0.85, 1.15)));
      p1 = { x: outer + rand(-6, 6), y: p0.y + (cta.bottom - p0.y) * rand(0.55, 0.8) };
      p2 = { x: outer, y: cta.top + ch * rand(0.55, 0.9) };
    } else {
      // The approach runs just under the button, beside the note, so it
      // passes under the copy rather than through it.
      const approachY = cta.bottom + ch * rand(0.3, 0.75);
      p2 = {
        x: Math.max(6, Math.min(maxX, edge - dir * ch * rand(1.2, 2))),
        y: approachY - rand(0, ch * 0.3),
      };
      p1 = { x: p0.x - dir * rand(0, 30), y: p0.y + (approachY - p0.y) * rand(0.6, 0.85) };
    }

    particle.alive = true;
    particle.p0 = p0;
    particle.p1 = p1;
    particle.p2 = p2;
    particle.p3 = p3;
    const puff = rand(8, 46);
    particle.puff = { x: ux * puff, y: uy * puff - rand(0, 10) };
    const spread = rand(6, 26);
    const na = rand(0, Math.PI * 2);
    particle.noise = { x: Math.cos(na) * spread, y: Math.sin(na) * spread };
    particle.age = 0;
    particle.dur = rand(1.9, 2.7);
    particle.size = Math.random() < 0.12 ? rand(1.8, 2.6) : rand(0.6, 1.6);
    particle.alpha = rand(0.45, 0.95);
    particle.light = Math.random() < 0.35;
    particle.wobble = rand(2, 5);
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
    el.style.transform =
      `translate3d(${(x - this.envW / 2).toFixed(2)}px, ${(y - this.envH / 2).toFixed(2)}px, 0) ` +
      `rotate(${r.toFixed(2)}deg) scale(${k.toFixed(3)})`;
    if (this.animate || env.state === "flow") el.style.opacity = o.toFixed(3);
    const z = env.state === "dissolve" || env.held ? 3 : 2;
    if (z !== env.z) {
      env.z = z;
      el.style.zIndex = String(z);
    }
    if (env.state === "flow") this.setInteractive(env, o > 0.45);
  }

  private drawMotes() {
    const ctx = this.motes;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.streams.clientWidth, this.streams.clientHeight);
    ctx.fillStyle = this.colors.mote;
    const spread = this.envW * 0.7;
    for (const lane of this.lanes) {
      for (const mote of lane.motes) {
        const y = lane.entry - mote.d;
        const o = this.fade(lane, y + this.envH * 0.4) * mote.alpha;
        if (o <= 0.01) continue;
        const x = lane.cx + mote.off * spread;
        ctx.globalAlpha = mote.line ? o * 0.35 : o;
        if (mote.line) ctx.fillRect(x, y, 0.8, 12 + mote.size * 10);
        else {
          ctx.beginPath();
          ctx.arc(x, y, mote.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawDust() {
    const ctx = this.dust;
    if (!ctx) return;
    if (!this.alive && !this.dustDirty) return;
    ctx.clearRect(0, 0, this.root.clientWidth, this.root.clientHeight);
    this.dustDirty = this.alive > 0;
    for (const light of [false, true]) {
      ctx.fillStyle = light ? this.colors.dust2 : this.colors.dust;
      for (const p of this.particles) {
        if (!p.alive || p.light !== light) continue;
        const t = clamp(p.age / p.dur);
        const e = t * t * (3 - 2 * t);
        const u = 1 - e;
        const b0 = u * u * u;
        const b1 = 3 * u * u * e;
        const b2 = 3 * u * e * e;
        const b3 = e * e * e;
        const burst = Math.sin(Math.min(1, t * 3) * (Math.PI / 2)) * u * u;
        const drift = Math.sin(Math.PI * e) * u;
        const wobble = Math.sin(p.age * p.wobble + p.seed) * 2 * u;
        const x = b0 * p.p0.x + b1 * p.p1.x + b2 * p.p2.x + b3 * p.p3.x + p.puff.x * burst + p.noise.x * drift + wobble;
        const y = b0 * p.p0.y + b1 * p.p1.y + b2 * p.p2.y + b3 * p.p3.y + p.puff.y * burst + p.noise.y * drift;
        // In quickly, then shrinking and fading as it enters the button.
        const end = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
        const s = p.size * (0.2 + 0.8 * end);
        ctx.globalAlpha = p.alpha * Math.min(1, t * 25) * end;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }
}
