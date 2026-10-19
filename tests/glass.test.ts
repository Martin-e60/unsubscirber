import assert from "node:assert/strict";
import test from "node:test";
import {
  glassView,
  modes,
  pageUnit,
  SHEETS,
  sheetTurn,
  START_TIME,
} from "../src/components/landing/glass-view";

// The approved frame is 1672 × 941; the page lays its copy out with this unit.
const reference = {
  width: 1672,
  height: 941,
  screenHeight: 941,
  anchorX: 836,
  anchorY: 486,
  unit: pageUnit(1672, 941),
  devicePixelRatio: 1,
};

test("at the approved size the scene fills the frame exactly as designed", () => {
  const view = glassView(reference);

  assert.equal(view.pixelWidth, 1672);
  assert.equal(view.pixelHeight, 941);
  // The original mapping: x / 1.7768 and y, with no offset.
  assert.ok(Math.abs(view.scaleX - 1 / 1.776833156) < 1e-6);
  assert.ok(Math.abs(view.scaleY - 1) < 1e-9);
  assert.ok(Math.abs(view.offsetY) < 1e-9);
  assert.ok(Math.abs(view.quietScale - 1) < 1e-9);
});

test("the frame is covered, never stretched, at other window shapes", () => {
  for (const [w, h] of [
    [1366, 768],
    [1920, 1080],
    [2560, 1080],
    [1440, 900],
    [1024, 768],
  ]) {
    const view = glassView({
      ...reference,
      width: w,
      height: h + 88,
      screenHeight: h,
      unit: pageUnit(w, h),
    });
    // One uniform scale for both axes: a world unit is as long across as down.
    const acrossPx = view.scaleX * (view.pixelWidth / 2);
    const downPx = view.scaleY * (view.pixelHeight / 2);
    assert.ok(Math.abs(acrossPx - downPx) < 1e-6, `${w}x${h} is not stretched`);
    // The frame reaches past every edge of the first screen.
    assert.ok(
      acrossPx * 1.776833156 * 2 >= view.pixelWidth - 1e-6,
      `${w}x${h} covers the width`,
    );
    const screenPx = (h / (h + 88)) * view.pixelHeight;
    assert.ok(downPx * 2 >= screenPx - 1e-6, `${w}x${h} covers the height`);
    assert.ok(view.pixelWidth <= 1920);
  }
});

test("the backbuffer is limited to 1.5x the pixel ratio and 1920 wide", () => {
  assert.equal(
    glassView({ ...reference, devicePixelRatio: 3 }).pixelWidth,
    1920,
  );
  assert.equal(
    glassView({ ...reference, width: 1000, height: 600, screenHeight: 600, devicePixelRatio: 2 })
      .pixelWidth,
    1500,
  );
});

test("the reading zone follows the copy, not the glass", () => {
  // Same window, twice the unit: the zone is twice as big.
  const small = glassView({ ...reference, unit: 1 });
  const large = glassView({ ...reference, unit: 2 });
  assert.ok(Math.abs(large.quietScale / small.quietScale - 2) < 1e-9);
  // y is measured up from the bottom of the backbuffer.
  assert.equal(small.quietY, 941 - 486);
});

test("six sheets share one drift and sway only a bounded amount", () => {
  assert.equal(SHEETS.length, 6);
  assert.ok(SHEETS.every((sheet) => sheet.rate === SHEETS[0].rate));
  for (const sheet of SHEETS) {
    for (const t of [0, 65, 1000, 86_400]) {
      assert.ok(Math.abs(sheetTurn(sheet, t) - sheet.a) <= sheet.wa + 1e-9);
    }
  }
});

test("the elastic modes stay bounded and the still pose is a real time", () => {
  for (const sheet of SHEETS) {
    for (let t = 0; t < 600; t += 7.3) {
      for (const q of modes(t, sheet.ph)) assert.ok(Math.abs(q) < 3);
    }
  }
  assert.ok(START_TIME > 0);
});
