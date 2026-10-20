import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The Home screen's numbers and wording.
 *
 * The impact figures are estimates shown to people as the benefit of using
 * the app, so what feeds them is pinned down here: only confirmed removals,
 * normalised to the period the data covers, never the pending or failed ones.
 */

const DAY = 86_400_000;

type StatusVolume = { status: string; senderCount: number; volume: number | null };

test("impact counts only confirmed removals", async () => {
  const { summariseStats } = await import("../src/lib/stats/summarise");

  const all: StatusVolume[] = [
    { status: "UNSUBSCRIBED", senderCount: 2, volume: 90 },
    { status: "REQUESTED", senderCount: 3, volume: 60 },
    { status: "MANUAL", senderCount: 2, volume: 20 },
    { status: "FAILED", senderCount: 1, volume: 10 },
    { status: "ACTIVE", senderCount: 5, volume: 200 },
  ];

  const now = Date.now();
  const stats = summariseStats({
    all,
    recent: [],
    previous: [],
    confirmed: [
      // 60 emails over three months: 20 a month.
      { messageCount: 60, firstSeenAt: new Date(now - 90 * DAY), lastSeenAt: new Date(now) },
      // 30 emails inside a fortnight: counted over one month, not half of one.
      { messageCount: 30, firstSeenAt: new Date(now - 14 * DAY), lastSeenAt: new Date(now) },
    ],
  });

  assert.equal(stats.confirmedUnsubscribes, 2, "requests sent do not count as confirmed");
  assert.equal(Math.round(stats.fewerEmailsPerMonth!), 50);
  assert.equal(Math.round(stats.timeSavedPerMonthSeconds!), 250, "5 seconds per email");
  assert.equal(stats.needsClick, 2);
  assert.equal(stats.failed, 1);
});

test("with no confirmed removals the estimates are absent, not zero", async () => {
  const { summariseStats } = await import("../src/lib/stats/summarise");

  const stats = summariseStats({
    all: [{ status: "REQUESTED", senderCount: 4, volume: 80 }],
    recent: [],
    previous: [],
    confirmed: [],
  });

  assert.equal(stats.confirmedUnsubscribes, 0);
  assert.equal(stats.fewerEmailsPerMonth, null);
  assert.equal(stats.timeSavedPerMonthSeconds, null);
});

test("monthly rate is normalised to the span actually seen", async () => {
  const { monthlyRate, emailsPerMonth } = await import("../src/lib/senders/derive");
  const now = Date.now();

  assert.equal(
    monthlyRate({ messageCount: 12, firstSeenAt: new Date(now - 360 * DAY), lastSeenAt: new Date(now) }),
    1,
  );
  // Seen once: one email over "one month".
  assert.equal(
    monthlyRate({ messageCount: 1, firstSeenAt: new Date(now), lastSeenAt: new Date(now) }),
    1,
  );
  // The per-row figure is still rounded and never below one.
  assert.equal(
    emailsPerMonth({ messageCount: 2, firstSeenAt: new Date(now - 300 * DAY), lastSeenAt: new Date(now) }),
    1,
  );
});

test("estimates are worded as estimates", async () => {
  const { formatEstimate, formatMinutes, periodLabel } = await import("../src/lib/home/format");

  assert.equal(formatEstimate(0.3), "<1");
  assert.equal(formatEstimate(179.6), "180");
  assert.equal(formatEstimate(1234), "1,234");

  assert.equal(formatMinutes(10), "<1 min");
  assert.equal(formatMinutes(900), "15 min");
  assert.equal(formatMinutes(4800), "1 h 20 min");
  assert.equal(formatMinutes(7200), "2 h");

  assert.equal(periodLabel(30), "Last 30 days");
  assert.equal(periodLabel(365), "Last year");
  assert.equal(periodLabel(45), "Last 45 days");
});

test("times read the way people say them", async () => {
  const { relativeTime, scanWhen } = await import("../src/lib/home/format");
  const now = new Date(2026, 8, 28, 15, 0);

  assert.equal(relativeTime(new Date(2026, 8, 28, 14, 59, 40).toISOString(), now), "Just now");
  assert.equal(relativeTime(new Date(2026, 8, 28, 14, 48).toISOString(), now), "12 min ago");
  assert.equal(relativeTime(new Date(2026, 8, 28, 11, 0).toISOString(), now), "4 h ago");
  assert.equal(relativeTime(new Date(2026, 8, 27, 23, 0).toISOString(), now), "Yesterday");

  assert.match(scanWhen(new Date(2026, 8, 28, 10, 42).toISOString(), now), /^Today, /);
  assert.match(scanWhen(new Date(2026, 8, 27, 10, 42).toISOString(), now), /^Yesterday, /);
});

test("activity groups real events and never mixes sent with confirmed", async () => {
  const { buildActivity } = await import("../src/lib/home/activity");

  const at = (d: number, h: number) => new Date(2026, 8, d, h).toISOString();
  const attempt = (id: string, status: string, createdAt: string) => ({
    id,
    senderId: id,
    senderAddress: `${id}@example.com`,
    senderName: null,
    method: "ONE_CLICK" as const,
    status,
    detail: null,
    createdAt,
  });

  const items = buildActivity({
    history: [
      attempt("a", "SUCCESS", at(27, 10)),
      attempt("b", "SUCCESS", at(27, 11)),
      attempt("c", "SUCCESS", at(27, 12)),
      attempt("d", "SENT", at(27, 12)),
      attempt("e", "SENT", at(27, 13)),
      attempt("f", "MANUAL_REQUIRED", at(28, 9)),
      attempt("g", "FAILED", at(28, 9)),
    ],
    scan: {
      scanId: "s1",
      status: "DONE",
      processedMessages: 900,
      matchedMessages: 300,
      foundSenders: 17,
      totalEstimate: 900,
      fraction: 1,
      done: true,
      error: null,
      lookbackDays: 30,
      startedAt: at(28, 10),
      finishedAt: at(28, 11),
    },
    limit: 5,
  });

  assert.deepEqual(
    items.map((item) => [item.kind, item.title]),
    [
      ["scan", "Scan completed"],
      ["sent", "2 requests sent"],
      ["removed", "3 subscriptions removed"],
    ],
    "newest first; clicks and failures stay out",
  );
  assert.equal(items[0].detail, "17 senders found · last 30 days.");
});

test("an unfinished scan is not reported as completed", async () => {
  const { buildActivity } = await import("../src/lib/home/activity");

  const items = buildActivity({
    history: [],
    scan: {
      scanId: "s2",
      status: "RUNNING",
      processedMessages: 100,
      matchedMessages: 10,
      foundSenders: 3,
      totalEstimate: 900,
      fraction: 0.1,
      done: false,
      error: null,
      lookbackDays: 30,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    },
  });

  assert.equal(items.length, 0);
});

test("the trend is a running total that ends where the headline figure does", async () => {
  const { summariseStats } = await import("../src/lib/stats/summarise");

  const now = new Date("2026-10-18T12:00:00Z");
  const span = (firstDays: number) => ({
    messageCount: 30,
    firstSeenAt: new Date(now.getTime() - firstDays * DAY),
    lastSeenAt: now,
  });

  const stats = summariseStats({
    all: [{ status: "UNSUBSCRIBED", senderCount: 3, volume: 90 }],
    recent: [],
    previous: [],
    now,
    confirmed: [
      // Out of order on purpose; 30 emails over 60 days is 15 a month.
      { ...span(60), confirmedAt: new Date(now.getTime() - 2 * DAY) },
      // 30 emails in a fortnight counts over one month: 30.
      { ...span(14), confirmedAt: new Date(now.getTime() - 9 * DAY) },
      // Undated: counted in the headline, absent from the line.
      { ...span(14), confirmedAt: null },
    ],
  });

  assert.deepEqual(
    stats.fewerEmailsTrend.map((p) => Math.round(p.value)),
    [30, 45, 45],
  );
  const times = stats.fewerEmailsTrend.map((p) => Date.parse(p.at));
  assert.deepEqual(times, [...times].sort((a, b) => a - b), "oldest first");
  assert.equal(times.at(-1), now.getTime(), "runs up to now");
  assert.equal(Math.round(stats.fewerEmailsPerMonth!), 75, "the headline includes the undated removal");
});

test("the trend line is monotone and needs two distinct moments", async () => {
  const { trendPath } = await import("../src/lib/home/trend");
  const at = (day: number) => new Date(Date.UTC(2026, 9, day)).toISOString();

  assert.equal(trendPath([], 400, 80), null);
  assert.equal(trendPath([{ at: at(1), value: 5 }], 400, 80), null);
  assert.equal(
    trendPath([{ at: at(1), value: 5 }, { at: at(1), value: 9 }], 400, 80),
    null,
    "two points at the same moment have no width",
  );

  const path = trendPath(
    [
      { at: at(1), value: 5 },
      { at: at(10), value: 6 },
      { at: at(12), value: 20 },
      { at: at(18), value: 20 },
    ],
    400,
    80,
  )!;
  assert.ok(path.line.startsWith("M0 77"), "starts at the bottom-left: the first value is the floor");
  assert.ok(path.area.endsWith("Z"));

  // Never dips: every y along the curve's control points is at or above its start.
  const ys = [...path.line.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
  const ends = ys.filter((_, i) => i === 0 || (i - 1) % 3 === 2);
  for (let i = 1; i < ends.length; i++) assert.ok(ends[i] <= ends[i - 1], "a running total never falls");

  const flat = trendPath([{ at: at(1), value: 7 }, { at: at(9), value: 7 }], 400, 80)!;
  assert.ok(flat.line.startsWith("M0 40"), "a series that never changes sits mid-height");
});

test("figures count up in whole minutes and settle on the real wording", async () => {
  const { formatMinutesCounting, formatMinutes } = await import("../src/lib/home/format");

  assert.equal(formatMinutesCounting(100, 0), "0 min");
  assert.equal(formatMinutesCounting(100, 0.5), "1 min", "rounded down on the way up");
  assert.equal(formatMinutesCounting(100, 0.99), "1 min", "not there until the end");
  assert.equal(formatMinutesCounting(100, 1), formatMinutes(100));
  assert.equal(formatMinutesCounting(10, 0), "0 min", "'<1 min' is kept for the end");
  assert.equal(formatMinutesCounting(10, 1), "<1 min");
});

test("the time ruler ends at the next round step and never stops growing", async () => {
  const { rulerEnd } = await import("../src/lib/home/ruler");
  const { formatMinutes } = await import("../src/lib/home/format");
  const end = (minutes: number) => formatMinutes(rulerEnd(minutes * 60));

  assert.equal(end(0), "10 min", "nothing saved still gets a ruler");
  assert.equal(end(0.2), "10 min");
  assert.equal(end(8), "10 min");
  assert.equal(end(9), "10 min");
  assert.equal(end(10), "30 min", "a figure never sits at the end of its own ruler");
  assert.equal(end(11), "30 min");
  assert.equal(end(29), "30 min");
  assert.equal(end(30), "1 h");
  assert.equal(end(60), "2 h");
  assert.equal(end(200), "5 h", "3 h 20 min");
  assert.equal(end(5 * 60), "10 h");
  assert.equal(end(10 * 60), "20 h");
  assert.equal(end(52 * 60), "100 h");
  assert.equal(end(24 * 60), "50 h", "a day is read in hours, like everywhere else");
  assert.equal(end(100 * 60), "200 h");
  assert.equal(end(999 * 60), "1000 h");
  assert.equal(end(1234 * 60), "2000 h");

  // Read the way it is printed: 9 min 40 s shows as "10 min", so the ruler has moved on.
  assert.equal(formatMinutes(580), "10 min");
  assert.equal(formatMinutes(rulerEnd(580)), "30 min");
  assert.equal(formatMinutes(rulerEnd(569)), "10 min");
});
