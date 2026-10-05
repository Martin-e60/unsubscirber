/**
 * The landing hero's inbox animation: what is shown, and how it moves.
 *
 * Plain DOM and one canvas, driven by a single requestAnimationFrame loop.
 * InboxScene.tsx renders a fixed pool of cards and rows once; this file only
 * recycles them, so nothing is mounted while it runs and neither the cards nor
 * the particles can pile up.
 *
 * Everything is illustrative. The emails are invented and picked from the
 * pools below; nothing reads a mailbox, calls the network or changes any state.
 *
 * Coordinates are "stage units": the 1072 × 880 box the approved design was
 * drawn in. CSS scales the stage to the page (see --u in InboxScene.module.css);
 * the engine multiplies by the measured scale when it writes a transform.
 * Card positions are their centres.
 */

export const STAGE = { w: 1072, h: 880 };
export const CARD = { w: 380, h: 96 };
/** The retained stack: top-left of the first row, row size and pitch. */
export const ROW = { x: 612, y: 588, w: 413, h: 79, gap: 85 };
export const ROW_COUNT = 3;
export const MID_SCALE = 0.64;
export const MID_OPACITY = 0.6;
/** Cards in the pool. More than there are slots, so leaving cards can finish. */
export const POOL_SIZE = 13;

export type Mail = { sender: string; subject: string; time: string };
export type Kept = Mail & { initials: string };

/** Where a resting card sits in the noise cloud. */
type Slot = { x: number; y: number; r: number; mid: boolean };

export const SLOTS: Slot[] = [
  { x: 265, y: 137, r: 3, mid: false },
  { x: 451, y: 228, r: -6, mid: false },
  { x: 845, y: 188, r: 7, mid: false },
  { x: 868, y: 312, r: 7, mid: false },
  { x: 217, y: 290, r: -3, mid: true },
  { x: 345, y: 362, r: -8, mid: true },
  { x: 655, y: 345, r: 6, mid: true },
  { x: 865, y: 425, r: -8, mid: true },
  { x: 138, y: 197, r: 12, mid: true },
  { x: 610, y: 124, r: -5, mid: true },
];

/** The first frame, as in the approved design. Also the reduced-motion view. */
export const OPENING: Array<{ slot: number; mail: Mail }> = [
  { slot: 8, mail: { sender: "Daily Deals", subject: "Member exclusive", time: "Mon" } },
  { slot: 4, mail: { sender: "Flash Sale", subject: "Ends tonight", time: "Tue" } },
  { slot: 5, mail: { sender: "Special Offer", subject: "Just for you", time: "Tue" } },
  { slot: 6, mail: { sender: "Limited time", subject: "While supplies last", time: "Tue" } },
  { slot: 7, mail: { sender: "Last chance", subject: "Final hours", time: "Tue" } },
  { slot: 0, mail: { sender: "Daily Deals", subject: "Huge savings just for you", time: "10:24 AM" } },
  { slot: 1, mail: { sender: "Flash Sale", subject: "24 hours only", time: "9:17 AM" } },
  { slot: 2, mail: { sender: "Last chance", subject: "Don’t miss these offers", time: "8:11 AM" } },
  { slot: 3, mail: { sender: "Weekly Offers", subject: "New deals every week", time: "Tue" } },
];

export const OPENING_KEPT: Kept[] = [
  { initials: "SS", sender: "Sunday Stories", subject: "A slower, kinder internet", time: "Sun" },
  { initials: "ND", sender: "Notes on Design", subject: "Ideas, tools and thoughtful reads", time: "Fri" },
  { initials: "FF", sender: "Friends & Family", subject: "Catching up from home", time: "Apr 16" },
];

/** Faint, blurred cards far behind the stream. Static apart from a slow drift. */
export const GHOSTS: Array<{ x: number; y: number; r: number; k: number; o: number; b: number; mail: Mail }> = [
  { x: 95, y: 40, r: 14, k: 0.5, o: 0.32, b: 1.4, mail: { sender: "Daily Deals", subject: "Member exclusive", time: "Mon" } },
  { x: 300, y: 18, r: 8, k: 0.45, o: 0.26, b: 1.8, mail: { sender: "Weekly Offers", subject: "New this week", time: "Sun" } },
  { x: 470, y: 112, r: -10, k: 0.5, o: 0.3, b: 1.4, mail: { sender: "Flash Sale", subject: "Ends tonight", time: "Sat" } },
  { x: 615, y: 150, r: 8, k: 0.48, o: 0.38, b: 0.8, mail: { sender: "Special Offer", subject: "Just for you", time: "Tue" } },
  { x: 780, y: -16, r: -6, k: 0.5, o: 0.2, b: 1.8, mail: { sender: "Price Drop", subject: "Cheaper today", time: "Mon" } },
  { x: 950, y: -20, r: 4, k: 0.5, o: 0.2, b: 2, mail: { sender: "VIP Access", subject: "Early access", time: "Sun" } },
  { x: 1050, y: 130, r: -8, k: 0.5, o: 0.28, b: 1.6, mail: { sender: "Bonus Points", subject: "Double points", time: "Fri" } },
  { x: 1045, y: 240, r: 10, k: 0.45, o: 0.28, b: 1.4, mail: { sender: "Deal of the Day", subject: "Today only", time: "Thu" } },
  { x: 1048, y: 370, r: -6, k: 0.45, o: 0.24, b: 1.8, mail: { sender: "Hot Picks", subject: "Trending now", time: "Wed" } },
  { x: 955, y: 482, r: 16, k: 0.5, o: 0.28, b: 1.4, mail: { sender: "Exclusive Deal", subject: "You might like this", time: "Tue" } },
  { x: 640, y: 450, r: 4, k: 0.45, o: 0.2, b: 1.8, mail: { sender: "Weekend Sale", subject: "Starts now", time: "Sat" } },
  { x: 40, y: 125, r: 18, k: 0.45, o: 0.2, b: 2, mail: { sender: "Cart Reminder", subject: "Still there?", time: "Fri" } },
  { x: 190, y: -6, r: -12, k: 0.45, o: 0.2, b: 2.2, mail: { sender: "New Arrivals", subject: "Fresh picks", time: "Thu" } },
  { x: 730, y: 228, r: -4, k: 0.45, o: 0.2, b: 1.8, mail: { sender: "Free Shipping", subject: "This weekend", time: "Wed" } },
];

/** The subscriptions being left. */
const PROMOS: Array<Omit<Mail, "time">> = [
  { sender: "Daily Deals", subject: "Huge savings just for you" },
  { sender: "Flash Sale", subject: "24 hours only" },
  { sender: "Last chance", subject: "Don’t miss these offers" },
  { sender: "Weekly Offers", subject: "New deals every week" },
  { sender: "Special Offer", subject: "Just for you" },
  { sender: "Limited time", subject: "While supplies last" },
  { sender: "Member Exclusive", subject: "Your rewards are waiting" },
  { sender: "Price Drop", subject: "Items you viewed are cheaper" },
  { sender: "Weekend Sale", subject: "Starts right now" },
  { sender: "Final hours", subject: "Ends at midnight" },
  { sender: "Mega Clearance", subject: "Up to 70% off" },
  { sender: "Bonus Points", subject: "Double points this week" },
  { sender: "New Arrivals", subject: "Fresh picks for you" },
  { sender: "Cart Reminder", subject: "You left something behind" },
  { sender: "VIP Access", subject: "Early access unlocked" },
  { sender: "Deal of the Day", subject: "Today only" },
  { sender: "Free Shipping", subject: "On every order this weekend" },
  { sender: "Hot Picks", subject: "Trending right now" },
];

/** The ones worth keeping. */
const KEEPERS: Array<Omit<Kept, "time">> = [
  { initials: "SS", sender: "Sunday Stories", subject: "A slower, kinder internet" },
  { initials: "ND", sender: "Notes on Design", subject: "Ideas, tools and thoughtful reads" },
  { initials: "FF", sender: "Friends & Family", subject: "Catching up from home" },
  { initials: "LR", sender: "The Long Read", subject: "Essays worth an evening" },
  { initials: "GL", sender: "Garden Letters", subject: "What to plant this month" },
  { initials: "FN", sender: "Field Notes", subject: "Small discoveries, weekly" },
  { initials: "KT", sender: "Kitchen Table", subject: "A recipe for Thursday" },
  { initials: "MP", sender: "Morning Pages", subject: "A quiet start to the day" },
  { initials: "LL", sender: "Local Library", subject: "New books on the shelf" },
  { initials: "TJ", sender: "Trail Journal", subject: "Routes for the weekend" },
];

const KEPT_TIMES = ["Sun", "Sat", "Fri", "Thu", "Wed", "Mon", "Apr 16", "Mar 28", "8:05 AM", "7:40 AM"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Where new cards come from, relative to their slot: above and to the right. */
const ENTRIES = [
  { dx: 320, dy: -230 },
  { dx: 150, dy: -300 },
  { dx: 430, dy: -70 },
  { dx: -60, dy: -280 },
  { dx: 380, dy: 120 },
];

/** The centre line the particles pour into, and where it starts. */
const FUNNEL = { x: 496, y: 370 };
const ROW_CENTRE = { x: ROW.x + ROW.w / 2, y: ROW.y + ROW.h / 2 };

const MAX_PARTICLES = 1400;
const AMBIENT_RATE = 120; // particles per second, always
const DISSOLVE_RATE = 260; // per second, per dissolving card
const TONES = ["#1f1f22", "#3d3d42", "#5f5f66", "#85858c", "#a9a9af", "#c9c9ce"];
const TAU = Math.PI * 2;

// --- Helpers -----------------------------------------------------------------

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

function randomTime(): string {
  if (Math.random() < 0.25) return pick(DAYS);
  const minutes = String(Math.floor(rand(0, 60))).padStart(2, "0");
  return `${Math.floor(rand(6, 12))}:${minutes} AM`;
}

function setText(node: HTMLElement | null, text: string) {
  if (node && node.textContent !== text) node.textContent = text;
}

// --- Particles ---------------------------------------------------------------

/** A fixed-size particle buffer. Emitting into a full buffer does nothing. */
class Particles {
  n = 0;
  x = new Float32Array(MAX_PARTICLES);
  y = new Float32Array(MAX_PARTICLES);
  vx = new Float32Array(MAX_PARTICLES);
  vy = new Float32Array(MAX_PARTICLES);
  age = new Float32Array(MAX_PARTICLES);
  life = new Float32Array(MAX_PARTICLES);
  size = new Float32Array(MAX_PARTICLES);
  alpha = new Float32Array(MAX_PARTICLES);
  lane = new Float32Array(MAX_PARTICLES);
  tone = new Uint8Array(MAX_PARTICLES);

  emit(x: number, y: number, vx: number, vy: number, life: number, size: number, tone: number, alpha: number) {
    if (this.n >= MAX_PARTICLES) return;
    const i = this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.age[i] = 0;
    this.life[i] = life;
    this.size[i] = size;
    this.tone[i] = tone;
    this.alpha[i] = alpha;
    this.lane[i] = rand(-1, 1);
  }

  /** One particle of the steady stream below the noise. */
  emitAmbient() {
    const angle = Math.random() * TAU;
    const reach = Math.sqrt(Math.random());
    const roll = Math.random();
    const size = roll < 0.6 ? rand(0.8, 1.8) : roll < 0.9 ? rand(1.8, 3.2) : rand(3.2, 5.5);
    this.emit(
      FUNNEL.x + Math.cos(angle) * reach * 80,
      FUNNEL.y + Math.sin(angle) * reach * 85,
      rand(-12, 12),
      rand(-6, 14),
      rand(2.6, 5),
      size,
      Math.floor(rand(0.5, 6)),
      rand(0.4, 0.9),
    );
  }

  /**
   * Every particle drifts down into a stream that bends right towards the
   * retained stack, with a little sideways swirl.
   */
  step(dt: number, time: number) {
    const follow = Math.min(1, dt * 1.6);
    for (let i = 0; i < this.n; ) {
      const age = (this.age[i] += dt);
      if (age >= this.life[i] || this.y[i] > STAGE.h + 20) {
        this.remove(i);
        continue;
      }
      const y = this.y[i];
      const bend = clamp01((y - 260) / 600);
      const centre = FUNNEL.x + 250 * bend * bend + this.lane[i] * (40 + 90 * bend);
      const wantX = (centre - this.x[i]) * 0.45 + 70 * bend * bend;
      const wantY = 22 + 75 * bend;
      this.vx[i] += (wantX - this.vx[i]) * follow + Math.sin(y * 0.03 + time * 1.1 + this.lane[i] * 9) * 18 * dt;
      this.vy[i] += (wantY - this.vy[i]) * follow;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      i++;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (let i = 0; i < this.n; i++) {
      const age = this.age[i];
      const life = this.life[i];
      const a = this.alpha[i] * Math.min(1, age / 0.25) * Math.min(1, (life - age) / (life * 0.5));
      if (a <= 0.01) continue;
      const size = this.size[i];
      ctx.globalAlpha = a;
      ctx.fillStyle = TONES[this.tone[i]];
      if (size < 1.8) {
        ctx.fillRect(this.x[i] - size / 2, this.y[i] - size / 2, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(this.x[i], this.y[i], size / 2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Swap-remove: order does not matter. */
  private remove(i: number) {
    const last = --this.n;
    if (i === last) return;
    this.x[i] = this.x[last];
    this.y[i] = this.y[last];
    this.vx[i] = this.vx[last];
    this.vy[i] = this.vy[last];
    this.age[i] = this.age[last];
    this.life[i] = this.life[last];
    this.size[i] = this.size[last];
    this.tone[i] = this.tone[last];
    this.alpha[i] = this.alpha[last];
    this.lane[i] = this.lane[last];
  }
}

// --- Retained stack ------------------------------------------------------------

type Row = {
  el: HTMLElement;
  sender: string;
  y: number;
  o: number;
  ty: number;
  to: number;
};

/** Three rows, newest on top. A fourth element is the one coming in or going out. */
class Stack {
  rows: Row[];
  order: Row[];

  constructor(elements: HTMLElement[]) {
    this.rows = elements.map((el) => ({ el, sender: "", y: 0, o: 0, ty: 0, to: 0 }));
    this.order = this.rows.slice(0, ROW_COUNT);
    this.rows.forEach((row, i) => {
      const shown = i < ROW_COUNT;
      if (shown) this.fill(row, OPENING_KEPT[i]);
      row.y = row.ty = ROW.y + Math.min(i, ROW_COUNT) * ROW.gap;
      row.o = row.to = shown ? 1 : 0;
    });
  }

  has(sender: string) {
    return this.order.some((row) => row.sender === sender);
  }

  push(mail: Kept) {
    const spare = this.rows.find((row) => !this.order.includes(row));
    if (!spare) return;
    const out = this.order.length >= ROW_COUNT ? this.order.pop() : undefined;
    if (out) {
      out.ty += 18;
      out.to = 0;
    }
    this.fill(spare, mail);
    spare.y = ROW.y - 26;
    spare.o = 0;
    spare.to = 1;
    this.order.unshift(spare);
    this.order.forEach((row, i) => {
      row.ty = ROW.y + i * ROW.gap;
    });
  }

  step(dt: number) {
    const f = 1 - Math.exp(-dt * 6);
    for (const row of this.rows) {
      row.y += (row.ty - row.y) * f;
      row.o += (row.to - row.o) * f;
    }
  }

  place(scale: number) {
    for (const row of this.rows) {
      row.el.style.transform = `translate3d(${(ROW.x * scale).toFixed(2)}px, ${(row.y * scale).toFixed(2)}px, 0)`;
      row.el.style.opacity = row.o.toFixed(3);
      row.el.style.visibility = row.o < 0.01 && row.to === 0 ? "hidden" : "visible";
    }
  }

  private fill(row: Row, mail: Kept) {
    row.sender = mail.sender;
    setText(row.el.querySelector("[data-initials]"), mail.initials);
    setText(row.el.querySelector("[data-sender]"), mail.sender);
    setText(row.el.querySelector("[data-subject]"), mail.subject);
    setText(row.el.querySelector("[data-time]"), mail.time);
  }
}

// --- Cards -------------------------------------------------------------------

type Pose = { x: number; y: number; r: number; k: number; o: number };
type Phase = "idle" | "enter" | "rest" | "travel" | "dissolve" | "keep";

type Card = {
  el: HTMLElement;
  phase: Phase;
  start: number;
  dur: number;
  slot: number;
  keep: boolean;
  mail: Mail | Kept;
  seed: number;
  from: Pose;
  to: Pose;
  pose: Pose;
  ctrl: { x: number; y: number };
  debt: number;
  marked: boolean;
};

const blankPose = (): Pose => ({ x: 0, y: 0, r: 0, k: 1, o: 0 });

function slotPose(slot: number): Pose {
  const s = SLOTS[slot];
  return { x: s.x, y: s.y, r: s.r, k: s.mid ? MID_SCALE : 1, o: s.mid ? MID_OPACITY : 1 };
}

// --- The scene -----------------------------------------------------------------

/**
 * Starts the scene inside `root` and returns a function that stops it.
 *
 * With `animate` false it lays out the opening composition, draws one still
 * frame of particles and does nothing else (reduced motion).
 */
export function startInboxScene(root: HTMLElement, animate: boolean): () => void {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  if (!stage) return () => {};
  return new Scene(root, stage, animate).stop;
}

class Scene {
  private canvas: HTMLCanvasElement | null;
  private ctx: CanvasRenderingContext2D | null;
  private pill: HTMLElement | null;
  private cards: Card[];
  private stack: Stack;
  private particles = new Particles();

  private scale = 0;
  private now = 0;
  private last = 0;
  private frame = 0;
  private running = false;
  private inView = true;

  private occupied: boolean[] = SLOTS.map(() => false);
  private slotFreeAt: number[] = SLOTS.map(() => 0);
  private nextSpawn = 1.2;
  // The first card to arrive is one to keep, so the whole story shows early.
  private sinceKeep = 3;
  private keepEvery = 3;
  private keepInFlight = false;
  private recent: string[] = [];
  private lastKeeper = "";
  private ambientDebt = 0;

  private resize: ResizeObserver | null = null;
  private visibility: IntersectionObserver | null = null;

  constructor(
    private root: HTMLElement,
    private stage: HTMLElement,
    private animate: boolean,
  ) {
    this.canvas = root.querySelector("canvas");
    this.ctx = this.canvas?.getContext("2d") ?? null;
    this.pill = root.querySelector("[data-pill]");
    this.stack = new Stack(Array.from(root.querySelectorAll<HTMLElement>("[data-row]")));
    this.cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card]"), (el) => ({
      el,
      phase: "idle" as Phase,
      start: 0,
      dur: 0,
      slot: -1,
      keep: false,
      mail: { sender: "", subject: "", time: "" },
      seed: rand(0, 100),
      from: blankPose(),
      to: blankPose(),
      pose: blankPose(),
      ctrl: { x: 0, y: 0 },
      debt: 0,
      marked: false,
    }));

    this.layOutOpening();

    // A still cloud from the first frame, rather than one that has to gather.
    for (let t = 0; t < 3.5; t += 1 / 30) this.stepParticles(1 / 30, t);

    this.measure();
    this.render();
    if (typeof ResizeObserver !== "undefined") {
      this.resize = new ResizeObserver(() => {
        this.measure();
        if (!this.running) this.render();
      });
      this.resize.observe(stage);
    }

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
    this.root.removeAttribute("data-paused");
  };

  // --- Lifecycle ---------------------------------------------------------------

  private sync = () => {
    this.setRunning(this.inView && document.visibilityState !== "hidden");
  };

  private setRunning(on: boolean) {
    if (on === this.running) return;
    this.running = on;
    // Pauses the CSS drift on the faint cards and streaks too.
    this.root.toggleAttribute("data-paused", !on);
    if (on) {
      this.last = 0;
      this.frame = requestAnimationFrame(this.tick);
    } else {
      cancelAnimationFrame(this.frame);
    }
  }

  private tick = (ms: number) => {
    if (!this.running) return;
    // Capped, so a dropped frame or a slow device slows the scene instead of
    // making it jump.
    const dt = this.last ? Math.min(0.05, (ms - this.last) / 1000) : 1 / 60;
    this.last = ms;
    this.step(dt);
    this.render();
    this.frame = requestAnimationFrame(this.tick);
  };

  private measure() {
    const width = this.stage.clientWidth;
    if (!width) return;
    this.scale = width / STAGE.w;
    if (this.canvas && this.ctx) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(this.stage.clientHeight * dpr);
      this.ctx.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, 0, 0);
    }
  }

  private render() {
    if (!this.scale) return;
    for (const card of this.cards) if (card.phase !== "idle") this.place(card);
    this.stack.place(this.scale);
    if (this.ctx) {
      this.ctx.clearRect(0, 0, STAGE.w, STAGE.h);
      this.particles.draw(this.ctx);
    }
  }

  // --- Simulation --------------------------------------------------------------

  private step(dt: number) {
    this.now += dt;
    if (this.now >= this.nextSpawn) this.spawn();
    for (const card of this.cards) this.update(card, dt);
    this.stack.step(dt);
    this.stepParticles(dt, this.now);
  }

  private stepParticles(dt: number, time: number) {
    this.ambientDebt += dt * AMBIENT_RATE;
    while (this.ambientDebt >= 1) {
      this.ambientDebt -= 1;
      this.particles.emitAmbient();
    }
    this.particles.step(dt, time);
  }

  private layOutOpening() {
    // Exits are staggered, so the stream starts at once but never all together.
    const order = OPENING.map((_, i) => i).sort(() => Math.random() - 0.5);
    this.cards.forEach((card, i) => {
      const opening = OPENING[i];
      this.reset(card);
      if (!opening) return;
      card.phase = "rest";
      card.slot = opening.slot;
      card.keep = false;
      card.mail = opening.mail;
      card.to = slotPose(opening.slot);
      card.pose = { ...card.to };
      card.start = 0;
      card.dur = 0.7 + order.indexOf(i) * 1.0 + rand(0, 0.5);
      this.occupied[opening.slot] = true;
      this.write(card);
      this.show(card, SLOTS[opening.slot].mid);
    });
  }

  private spawn() {
    const card = this.cards.find((c) => c.phase === "idle");
    const free = SLOTS.map((_, i) => i).filter((i) => !this.occupied[i] && this.now >= this.slotFreeAt[i]);
    if (!card || !free.length) {
      this.nextSpawn = this.now + 0.4;
      return;
    }

    const slot = pick(free);
    const keep = !this.keepInFlight && this.sinceKeep >= this.keepEvery;
    if (keep) {
      this.keepInFlight = true;
      this.sinceKeep = 0;
      this.keepEvery = 3 + Math.floor(rand(0, 3));
    } else {
      this.sinceKeep++;
    }

    card.slot = slot;
    card.keep = keep;
    card.mail = keep ? this.nextKeeper() : this.nextPromo();
    card.seed = rand(0, 100);
    card.to = slotPose(slot);
    card.to.r += rand(-1.5, 1.5);
    const entry = pick(ENTRIES);
    card.from = {
      x: card.to.x + entry.dx + rand(-50, 50),
      y: card.to.y + entry.dy + rand(-40, 40),
      r: card.to.r + rand(-9, 9),
      k: card.to.k * 0.94,
      o: 0,
    };
    card.pose = { ...card.from };
    card.phase = "enter";
    card.start = this.now;
    card.dur = rand(1.6, 2.3);
    this.occupied[slot] = true;
    this.write(card);
    this.show(card, SLOTS[slot].mid);

    const settled = this.cards.filter((c) => c.phase === "enter" || c.phase === "rest").length;
    this.nextSpawn = this.now + (settled < 6 ? rand(0.5, 0.9) : rand(1.1, 1.8));
  }

  private update(card: Card, dt: number) {
    if (card.phase === "idle") return;
    const t = this.now - card.start;
    const p = card.dur > 0 ? clamp01(t / card.dur) : 1;
    const { pose, from, to } = card;

    switch (card.phase) {
      case "enter": {
        this.mix(pose, from, to, easeOut(p));
        if (p >= 1) {
          card.phase = "rest";
          card.start = this.now;
          card.dur = card.keep ? rand(1.6, 2.6) : rand(2.4, 5);
        }
        break;
      }
      case "rest": {
        // A slow float, eased in so a card that has just landed does not jump.
        const ramp = Math.min(1, t / 1.2);
        pose.x = to.x + Math.sin(this.now * 0.55 + card.seed) * 3.2 * ramp;
        pose.y = to.y + Math.cos(this.now * 0.47 + card.seed) * 2.4 * ramp;
        pose.r = to.r + Math.sin(this.now * 0.31 + card.seed) * 0.5 * ramp;
        pose.k = to.k;
        pose.o = to.o;
        if (p >= 1) {
          // Only a few leave at once, so the motion stays calm. A card to keep
          // never waits: it is the point of the scene.
          if (!card.keep && this.leaving() >= 3) card.dur += 0.7;
          else this.leave(card);
        }
        break;
      }
      case "travel": {
        this.mix(pose, from, to, easeInOut(p));
        if (p >= 1) {
          card.phase = "dissolve";
          card.start = this.now;
          card.dur = 1.3;
          card.from = { ...pose };
          card.debt = 0;
          card.el.setAttribute("data-dissolving", "");
        }
        break;
      }
      case "dissolve": {
        const e = easeInOut(p);
        pose.x = from.x + 16 * e;
        pose.y = from.y + 8 * e;
        pose.r = from.r + 3 * e;
        // The visible part of the card, as a fraction of its width.
        const edge = 1.16 - 1.18 * e;
        card.el.style.setProperty("--edge", `${(edge * 100).toFixed(1)}%`);
        this.shed(card, edge, dt);
        if (!card.marked && p > 0.55) {
          card.marked = true;
          this.popPill();
        }
        if (p >= 1) this.reset(card);
        break;
      }
      case "keep": {
        const e = easeInOut(p);
        const u = 1 - e;
        pose.x = u * u * from.x + 2 * u * e * card.ctrl.x + e * e * to.x;
        pose.y = u * u * from.y + 2 * u * e * card.ctrl.y + e * e * to.y;
        pose.r = lerp(from.r, 0, e);
        pose.k = lerp(from.k, 1, e);
        pose.o = p < 0.72 ? lerp(from.o, 1, clamp01(p * 3)) : lerp(1, 0, (p - 0.72) / 0.28);
        if (!card.marked && p >= 0.72) {
          card.marked = true;
          this.keepInFlight = false;
          this.stack.push(card.mail as Kept);
        }
        if (p >= 1) this.reset(card);
        break;
      }
    }
  }

  private leave(card: Card) {
    this.occupied[card.slot] = false;
    this.slotFreeAt[card.slot] = this.now + 0.8;
    card.from = { ...card.pose };
    card.start = this.now;
    card.marked = false;

    if (card.keep) {
      card.phase = "keep";
      card.to = { x: ROW_CENTRE.x, y: ROW_CENTRE.y, r: 0, k: 1, o: 0 };
      card.ctrl = { x: Math.min(card.from.x, 640) - 40, y: 540 };
      card.dur = rand(1.9, 2.3);
      card.el.setAttribute("data-keeping", "");
      card.el.style.zIndex = "6";
      return;
    }

    card.phase = "travel";
    card.to = {
      x: rand(440, 545),
      y: rand(290, 350),
      r: card.from.r + rand(-7, 7),
      k: card.from.k * 0.94,
      o: card.from.o,
    };
    const distance = Math.hypot(card.to.x - card.from.x, card.to.y - card.from.y);
    card.dur = 0.9 + distance / 600;
    card.el.style.zIndex = "5";
  }

  /** Particles break off along the dissolving edge. */
  private shed(card: Card, edge: number, dt: number) {
    const { pose } = card;
    const cos = Math.cos((pose.r * Math.PI) / 180);
    const sin = Math.sin((pose.r * Math.PI) / 180);
    card.debt += dt * DISSOLVE_RATE * pose.k;
    while (card.debt >= 1) {
      card.debt -= 1;
      const lx = (clamp01(edge - rand(0, 0.16)) - 0.5) * CARD.w * pose.k;
      const ly = rand(-0.5, 0.5) * CARD.h * pose.k;
      const roll = Math.random();
      this.particles.emit(
        pose.x + lx * cos - ly * sin,
        pose.y + lx * sin + ly * cos,
        rand(-20, 50),
        rand(-35, 5),
        rand(1.8, 3.6),
        roll < 0.08 ? rand(2.8, 5) : roll < 0.4 ? rand(1.6, 2.8) : rand(0.6, 1.6),
        roll < 0.3 ? Math.floor(rand(0, 3)) : Math.floor(rand(2, 6)),
        rand(0.45, 0.95) * pose.o,
      );
    }
  }

  private leaving() {
    return this.cards.filter((c) => c.phase === "travel" || c.phase === "dissolve" || c.phase === "keep").length;
  }

  private nextPromo(): Mail {
    const shown = new Set(this.cards.filter((c) => c.phase !== "idle").map((c) => c.mail.sender));
    const fresh = PROMOS.filter((m) => !shown.has(m.sender) && !this.recent.includes(m.sender));
    const mail = pick(fresh.length ? fresh : PROMOS);
    this.recent = [...this.recent.slice(-5), mail.sender];
    return { ...mail, time: randomTime() };
  }

  private nextKeeper(): Kept {
    const fresh = KEEPERS.filter((m) => !this.stack.has(m.sender) && m.sender !== this.lastKeeper);
    const mail = pick(fresh.length ? fresh : KEEPERS);
    this.lastKeeper = mail.sender;
    return { ...mail, time: pick(KEPT_TIMES) };
  }

  private popPill() {
    if (typeof this.pill?.animate !== "function") return;
    this.pill.animate([{ scale: "1" }, { scale: "1.08" }, { scale: "1" }], {
      duration: 480,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    });
  }

  // --- DOM -----------------------------------------------------------------------

  private mix(out: Pose, a: Pose, b: Pose, t: number) {
    out.x = lerp(a.x, b.x, t);
    out.y = lerp(a.y, b.y, t);
    out.r = lerp(a.r, b.r, t);
    out.k = lerp(a.k, b.k, t);
    out.o = lerp(a.o, b.o, t);
  }

  private write(card: Card) {
    setText(card.el.querySelector("[data-sender]"), card.mail.sender);
    setText(card.el.querySelector("[data-subject]"), card.mail.subject);
    setText(card.el.querySelector("[data-time]"), card.mail.time);
  }

  private show(card: Card, mid: boolean) {
    card.el.style.visibility = "visible";
    card.el.style.zIndex = mid ? "2" : "4";
  }

  private place(card: Card) {
    const { x, y, r, k, o } = card.pose;
    const s = this.scale;
    card.el.style.transform =
      `translate3d(${((x - CARD.w / 2) * s).toFixed(2)}px, ${((y - CARD.h / 2) * s).toFixed(2)}px, 0) ` +
      `rotate(${r.toFixed(2)}deg) scale(${k.toFixed(3)})`;
    card.el.style.opacity = o.toFixed(3);
  }

  private reset(card: Card) {
    card.phase = "idle";
    card.el.style.visibility = "hidden";
    card.el.style.opacity = "0";
    card.el.removeAttribute("data-dissolving");
    card.el.removeAttribute("data-keeping");
    card.el.style.removeProperty("--edge");
  }
}
