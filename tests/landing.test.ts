import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * The landing page's behaviour and constraints that are not visual.
 *
 * The visual design is checked in a real browser; these pin down the parts a
 * refactor could quietly break: the accordion rule, the approved palette, and
 * that the landing styles cannot leak into the rest of the app.
 */

test("the outcomes accordion keeps at most one row open", async () => {
  const { nextOpen } = await import("../src/components/landing/accordion");

  // The first row starts open; opening another closes it.
  assert.equal(nextOpen(0, 2), 2);
  // Opening a row from nothing open.
  assert.equal(nextOpen(null, 1), 1);
  // Clicking the open row closes it.
  assert.equal(nextOpen(2, 2), null);
});

test("the landing tokens are exactly the approved HEX values", () => {
  const css = fs.readFileSync(
    path.join("src", "components", "landing", "theme.module.css"),
    "utf8",
  );

  const approved: Record<string, string> = {
    "--lp-bg": "#FBF4EF",
    "--lp-text": "#35232B",
    "--lp-text-2": "#795C65",
    "--lp-accent": "#A32D4D",
    "--lp-soft": "#F5D8DE",
    "--lp-line": "#E8D6D9",
    "--lp-panel": "#FFFEFC",
    "--lp-on-accent": "#FFFFFF",
  };

  for (const [token, hex] of Object.entries(approved)) {
    const match = new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})\\s*;`).exec(css);
    assert.ok(match, `${token} is defined`);
    assert.equal(match[1].toUpperCase(), hex, `${token} is ${hex}`);
  }
});

test("landing styles are scoped: no global selectors except the page's own body", () => {
  const dir = path.join("src", "components", "landing");
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".css"))
    .map((file) => path.join(dir, file))
    .concat(path.join("src", "app", "page.module.css"));

  for (const file of files) {
    const css = fs.readFileSync(file, "utf8");
    const globals = css.match(/:global\([^)]*\)[^{]*/g) ?? [];
    for (const selector of globals) {
      // The one allowed exception paints the body only when it contains the
      // landing page's own themed root.
      assert.match(
        selector.trim(),
        /^:global\(body\):has\(\.theme\)$/,
        `${file} must not style other pages: ${selector.trim()}`,
      );
    }
  }
});

/** The approved 1440 × 900 frame's lane, as streamsEngine.ts builds it. */
const LANE = { r0: 497, k: 0.0018, y0: 402, lim: 360 };

test("a lane bows outward at mid-height and comes back in at both ends", async () => {
  const { laneOffset } = await import("../src/components/landing/laneGeometry");

  // Widest at the apex, closer to the middle above and below it.
  assert.equal(laneOffset(LANE, LANE.y0), LANE.r0);
  assert.ok(laneOffset(LANE, LANE.y0 - 200) < laneOffset(LANE, LANE.y0));
  assert.ok(laneOffset(LANE, LANE.y0 + 200) < laneOffset(LANE, LANE.y0));
  // A curve, not a slant: the same either side of the apex.
  assert.equal(laneOffset(LANE, LANE.y0 - 150), laneOffset(LANE, LANE.y0 + 150));
  // The three envelopes of the approved frame sit on it (centres 432 / 498 / 418
  // from the middle at heights 218 / 402 / 617), within a few pixels.
  for (const [y, from] of [[218, 432], [402, 498], [617, 418]]) {
    assert.ok(Math.abs(laneOffset(LANE, y) - from) < 8, `y ${y}: ${laneOffset(LANE, y)} vs ${from}`);
  }
  // Beyond the limit it carries on straight: it keeps closing in, and never
  // folds back over itself or crosses to the other lane.
  let last = Infinity;
  for (let dy = 0; dy <= 3000; dy += 50) {
    const here = laneOffset(LANE, LANE.y0 - dy);
    assert.ok(here < last || dy === 0, `still closing in at ${dy}`);
    last = here;
  }
});

test("envelopes turn gently with the lane, and the two lanes mirror each other", async () => {
  const { laneLean, paperTilt } = await import("../src/components/landing/laneGeometry");

  // Level at the apex, leaning in above it and out below it.
  assert.ok(Math.abs(laneLean(LANE, LANE.y0)) < 1e-9);
  assert.ok(laneLean(LANE, LANE.y0 - 200) > 0);
  assert.ok(laneLean(LANE, LANE.y0 + 200) < 0);

  // Left lane (+1) and right lane (-1) tip opposite ways by the same amount.
  for (const dy of [-300, -100, 0, 120, 280]) {
    const lean = laneLean(LANE, LANE.y0 + dy);
    assert.equal(paperTilt(1, lean, 1.5), -paperTilt(-1, lean, 1.5));
  }
  // The approved frame: the top one tipped back, the middle and lower ones forwards.
  assert.ok(paperTilt(1, laneLean(LANE, 218)) < 0);
  assert.ok(paperTilt(1, laneLean(LANE, 402)) > 10);
  assert.ok(paperTilt(1, laneLean(LANE, 617)) > 10);

  // Never stood on end, however far along the lane: readable at any height.
  for (let y = -3000; y <= 4000; y += 25) {
    for (const own of [-2.5, 0, 3]) {
      const tilt = paperTilt(1, laneLean(LANE, y), own);
      assert.ok(tilt > -15 && tilt < 25, `tilt ${tilt} at ${y}`);
    }
  }
});

test("an envelope is gone before its paper reaches the header or the hint", async () => {
  const { edgeFade } = await import("../src/components/landing/laneGeometry");
  // Header edge at 78, clear from 134; hint edge at 779, clear from 723.
  const fade = (top: number, bottom: number) => edgeFade(top, bottom, 78, 134, 779, 723);

  assert.equal(fade(78, 300), 0);
  assert.equal(fade(40, 300), 0);
  assert.equal(fade(134, 300), 1);
  assert.equal(fade(400, 779), 0);
  assert.equal(fade(400, 900), 0);
  assert.equal(fade(400, 723), 1);
  // Between, it comes and goes smoothly.
  let last = -1;
  for (let top = 78; top <= 134; top += 4) {
    const o = fade(top, 300);
    assert.ok(o >= last);
    last = o;
  }
  // Whichever edge is nearer decides.
  assert.equal(fade(100, 760), Math.min(fade(100, 300), fade(400, 760)));
});

test("the landing page no longer links to the removed free page", () => {
  const page = fs.readFileSync(path.join("src", "app", "page.tsx"), "utf8");
  const components = fs
    .readdirSync(path.join("src", "components", "landing"))
    .filter((file) => file.endsWith(".tsx"))
    .map((file) =>
      fs.readFileSync(path.join("src", "components", "landing", file), "utf8"),
    );

  for (const source of [page, ...components]) {
    assert.ok(!source.includes('"/free"'), "no link to /free");
  }
});
