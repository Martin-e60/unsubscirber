import { test } from "node:test";
import assert from "node:assert/strict";
import { reflectionPose, type ReflectionSource } from "../src/components/landing/reflectionGeometry";

const surface = [
  { x: 278, y: -65 }, { x: 390, y: 218 }, { x: 360, y: 402 },
  { x: 380, y: 617 }, { x: 211, y: 963 },
];
const source: ReflectionSource = { x: 288, y: 218, rotation: -11, depth: 1, width: 300, height: 114 };

test("the reflection stays on the visible expanded surface throughout the lane", () => {
  for (let y = 80; y <= 800; y += 20) {
    const x = 720 - (497 - 0.0018 * (y - 402) ** 2);
    const pose = reflectionPose({ ...source, x, y }, surface, 1)!;
    assert.ok(pose.x > 200 && pose.x < 440, `visible left surface at ${y}`);
    assert.ok(1440 - pose.x > 1000 && 1440 - pose.x < 1240, `visible right surface at ${y}`);
    assert.ok(pose.proximity >= 0 && pose.proximity <= 1);
  }
});

test("moving and tilting paper changes its partial reflected pose smoothly", () => {
  const a = reflectionPose(source, surface, 1)!;
  const b = reflectionPose({ ...source, x: source.x + 10, y: source.y + 1, rotation: -5 }, surface, 1)!;
  assert.notEqual(a.rotation, b.rotation);
  assert.notEqual(a.x, b.x);
  assert.ok(Math.abs(a.y - b.y) < 10);
  assert.ok(a.scaleX < 0.6 && a.scaleY < 1, "compressed partial silhouette");
});

test("reflection proximity fades with separation, and coordinates scale with the scene", () => {
  const near = reflectionPose(source, surface, 1)!;
  const far = reflectionPose({ ...source, x: -300 }, surface, 1)!;
  assert.ok(near.proximity > 0.5);
  assert.equal(far.proximity, 0);
  const scaled = reflectionPose({ ...source, x: source.x / 2, y: source.y / 2, width: 150, height: 57 }, surface.map(p => ({x:p.x/2,y:p.y/2})), 0.5)!;
  assert.ok(Math.abs(scaled.x * 2 - near.x) < 0.001);
  assert.ok(Math.abs(scaled.y * 2 - near.y) < 0.001);
  assert.ok(Math.abs(scaled.blur * 2 - near.blur) < 0.001);
  assert.equal(reflectionPose(source, [], 1), null);
});
