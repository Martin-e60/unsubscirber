import { test } from "node:test";
import assert from "node:assert/strict";
import { monthYear, receivedLabel } from "../src/components/cleanup/format";

/** Cleanup's date wording, with the clock pinned. */

const now = new Date(2026, 8, 29, 10, 42);
const at = (year: number, month: number, day: number, hour = 9) =>
  new Date(year, month, day, hour).toISOString();

test("last received reads in days, then as a date", () => {
  assert.equal(receivedLabel(at(2026, 8, 29, 8), now), "Today");
  assert.equal(receivedLabel(at(2026, 8, 28, 23), now), "Yesterday");
  assert.equal(receivedLabel(at(2026, 8, 25), now), "4 days ago");
  assert.equal(receivedLabel(at(2026, 8, 22), now), "22 Sep");
  assert.equal(receivedLabel(at(2025, 11, 3), now), "3 Dec 2025");
  assert.equal(receivedLabel(null, now), "Unknown");
});

test("first seen reads as month and year", () => {
  assert.equal(monthYear(at(2025, 10, 14)), "Nov 2025");
  assert.equal(monthYear(null), null);
});
