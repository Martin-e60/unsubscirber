import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

/**
 * Tests for the public demo.
 *
 * The demo's whole promise is that it is inert: a stranger can click every
 * button on it without an account, without a mailbox, and without anything
 * leaving their browser. That promise is not something you can eyeball, so it is
 * pinned down here.
 *
 * Deliberately hostile setup: the database URL is nonsense, no Google
 * credentials exist, and `fetch` throws if it is called at all. If the demo ever
 * starts depending on a server, these tests stop passing.
 */

process.env.DATABASE_URL = "file:/nonexistent/should-never-be-opened.db";
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;

const realFetch = globalThis.fetch;
let fetchCalls = 0;

/** A minimal localStorage, so the store has somewhere to be per-visitor. */
function makeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    api: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, String(value)),
      removeItem: (key: string) => void map.delete(key),
      clear: () => map.clear(),
      key: (index: number) => [...map.keys()][index] ?? null,
      get length() {
        return map.size;
      },
    } as unknown as Storage,
  };
}

let visitor = makeStorage();

let demoClient: typeof import("../src/lib/demo/client")["demoClient"];
let store: typeof import("../src/lib/demo/store");
let SENDER_STATUS: typeof import("../src/lib/constants")["SENDER_STATUS"];
let ApiRequestError: typeof import("../src/lib/api/client")["ApiRequestError"];

type SenderDto = import("../src/lib/api/types").SenderDto;
type SendersResponse = import("../src/lib/api/types").SendersResponse;
type StatsDto = import("../src/lib/api/types").StatsDto;
type HistoryItemDto = import("../src/lib/api/types").HistoryItemDto;
type ScanProgressDto = import("../src/lib/api/types").ScanProgressDto;
type UnsubscribeResultDto = import("../src/lib/api/types").UnsubscribeResultDto;

before(async () => {
  // Any network call at all is a failure, not a slow path.
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("the demo must never make a network request");
  }) as typeof fetch;

  (globalThis as { window?: unknown }).window = { localStorage: visitor.api };

  ({ demoClient, ApiRequestError } = {
    ...(await import("../src/lib/demo/client")),
    ...(await import("../src/lib/api/client")),
  });
  store = await import("../src/lib/demo/store");
  ({ SENDER_STATUS } = await import("../src/lib/constants"));
});

beforeEach(() => {
  // A fresh visitor for every test.
  visitor = makeStorage();
  (globalThis as { window?: unknown }).window = { localStorage: visitor.api };
  store.clearState();
});

after(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as { window?: unknown }).window;
});

test("the demo answers every screen's request without any network call", async () => {
  const session = await demoClient.get<{ user: unknown; account: unknown }>("/api/me");
  assert.ok(session.user, "the demo has a signed-in user");
  assert.ok(session.account, "and a connected mailbox");

  const list = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&sort=count");
  assert.ok(list.senders.length > 5, "the demo mailbox is populated");

  const stats = await demoClient.get<StatsDto>("/api/stats");
  assert.equal(typeof stats.inboxHealth, "number");

  const attempts = await demoClient.get<HistoryItemDto[]>("/api/history");
  assert.ok(attempts.length > 0, "there is a history to look at from the start");

  const scan = await demoClient.get<ScanProgressDto | null>("/api/scan");
  assert.ok(scan, "the demo mailbox has already been scanned once");

  assert.equal(fetchCalls, 0);
});

test("every sender and link in the demo is invented", async () => {
  const all = await demoClient.get<SendersResponse>("/api/senders?status=ALL&limit=500");

  for (const sender of all.senders) {
    const domain = sender.address.split("@")[1] ?? "";
    assert.match(
      domain,
      /(^|\.)example\.(com|org|net)$/,
      `${sender.address} must sit on a reserved example domain`,
    );
    if (sender.manualUrl) {
      assert.match(
        new URL(sender.manualUrl).hostname,
        /(^|\.)example\.com$/,
        "a manual link must not point at a real unsubscribe endpoint",
      );
    }
  }
});

test("a simulated unsubscribe changes state without sending anything", async () => {
  const before = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&sort=count");
  const target = before.senders.find((sender) => sender.canUnsubscribe);
  assert.ok(target, "something in the demo can be unsubscribed");

  const result = await demoClient.post<UnsubscribeResultDto>("/api/unsubscribe", {
    senderId: target.id,
  });

  const reportable: string[] = [
    SENDER_STATUS.UNSUBSCRIBED,
    SENDER_STATUS.REQUESTED,
    SENDER_STATUS.MANUAL,
    SENDER_STATUS.FAILED,
  ];
  assert.ok(
    reportable.includes(result.status),
    "the outcome is one of the four the real engine can report",
  );
  assert.ok(result.detail.length > 0, "and it explains itself");

  const after = await demoClient.get<SendersResponse>("/api/senders?status=ALL&limit=500");
  const moved = after.senders.find((sender) => sender.id === target.id);
  assert.equal(moved?.status, result.status, "the list reflects the outcome");

  const attempts = await demoClient.get<HistoryItemDto[]>("/api/history");
  assert.equal(attempts[0]?.senderId, target.id, "the attempt is logged, newest first");

  assert.equal(fetchCalls, 0);
});

test("the demo reports all four outcomes, not just success", async () => {
  const all = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&limit=500");

  const outcomes = new Set<string>();
  // Collected as plain strings: the point is which outcomes appear at all.
  for (const sender of all.senders) {
    const result = await demoClient.post<UnsubscribeResultDto>("/api/unsubscribe", {
      senderId: sender.id,
    });
    outcomes.add(result.status);
  }

  for (const status of [
    SENDER_STATUS.UNSUBSCRIBED,
    SENDER_STATUS.REQUESTED,
    SENDER_STATUS.MANUAL,
    SENDER_STATUS.FAILED,
  ]) {
    assert.ok(outcomes.has(status as string), `the demo can end in ${status}`);
  }
});

test("an unsubscribe that was already sent is never sent twice", async () => {
  const list = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&sort=count");
  const target = list.senders.find((sender) => sender.canUnsubscribe)!;

  const first = await demoClient.post<UnsubscribeResultDto>("/api/unsubscribe", {
    senderId: target.id,
  });

  if (
    first.status === SENDER_STATUS.UNSUBSCRIBED ||
    first.status === SENDER_STATUS.REQUESTED
  ) {
    const again = await demoClient.post<UnsubscribeResultDto>("/api/unsubscribe", {
      senderId: target.id,
    });
    assert.equal(again.method, null, "no method is attempted a second time");
    assert.match(again.detail, /[Aa]lready/);

    await assert.rejects(
      () => demoClient.patch(`/api/senders/${target.id}`, { status: SENDER_STATUS.KEPT }),
      (error: unknown) =>
        error instanceof ApiRequestError && error.status === 409,
      "and Keep cannot quietly undo a sent unsubscribe",
    );
  }
});

test("the numbers move in step with the actions, using the app's own arithmetic", async () => {
  const start = await demoClient.get<StatsDto>("/api/stats");

  const list = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&sort=count");
  const keep = list.senders[0];
  await demoClient.patch<SenderDto>(`/api/senders/${keep.id}`, {
    status: SENDER_STATUS.KEPT,
  });

  const afterKeep = await demoClient.get<StatsDto>("/api/stats");
  assert.equal(
    afterKeep.emailsHandled,
    start.emailsHandled + keep.messageCount,
    "keeping a sender counts as a decision",
  );
  assert.equal(
    afterKeep.timeSavedSeconds,
    start.timeSavedSeconds,
    "but a kept sender still arrives, so it saves no time",
  );
  assert.ok(afterKeep.inboxHealth >= start.inboxHealth);
  assert.equal(afterKeep.activeSenders, start.activeSenders - 1);
});

test("rolled-up senders are never counted as mail that stopped arriving", async () => {
  const list = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&sort=count");
  const target = list.senders[0];
  const before = await demoClient.get<StatsDto>("/api/stats");

  await demoClient.patch<SenderDto>(`/api/senders/${target.id}`, {
    status: SENDER_STATUS.ROLLED_UP,
  });

  const after = await demoClient.get<StatsDto>("/api/stats");
  assert.equal(after.timeSavedSeconds, before.timeSavedSeconds);
  assert.equal(after.emailsHandled, before.emailsHandled + target.messageCount);
});

test("search and sort work on the demo list", async () => {
  const byName = await demoClient.get<SendersResponse>(
    "/api/senders?status=ALL&sort=name&limit=500",
  );
  const names = byName.senders.map((sender) => sender.name ?? sender.address);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));

  const byCount = await demoClient.get<SendersResponse>(
    "/api/senders?status=ALL&sort=count&limit=500",
  );
  // "Most emails" follows the monthly rate the list displays.
  const rates = byCount.senders.map((sender) => sender.perMonth);
  assert.deepEqual(rates, [...rates].sort((a, b) => b - a));

  const term = byCount.senders[0].name!.split(" ")[0];
  const found = await demoClient.get<SendersResponse>(
    `/api/senders?status=ALL&search=${encodeURIComponent(term.toLowerCase())}&limit=500`,
  );
  assert.ok(found.senders.length > 0);
  assert.ok(
    found.senders.every(
      (sender) =>
        (sender.name ?? "").toLowerCase().includes(term.toLowerCase()) ||
        sender.address.toLowerCase().includes(term.toLowerCase()),
    ),
  );
});

test("a simulated scan reports progress and finishes", async () => {
  const started = await demoClient.post<ScanProgressDto>("/api/scan/start", {
    lookbackDays: 30,
  });
  assert.equal(started.done, false);
  assert.equal(started.processedMessages, 0);

  let progress = started;
  let steps = 0;
  const seen: number[] = [];
  while (!progress.done && steps < 100) {
    progress = await demoClient.post<ScanProgressDto>("/api/scan/step", {
      scanId: started.scanId,
    });
    seen.push(progress.fraction);
    steps += 1;
  }

  assert.ok(progress.done, "the scan terminates");
  assert.ok(steps > 1, "and takes more than one step, so progress is visible");
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b), "progress only moves forward");
  assert.equal(progress.fraction, 1);
  assert.equal(fetchCalls, 0);
});

test("scanning further back turns up senders the default window did not", async () => {
  const before = await demoClient.get<SendersResponse>("/api/senders?status=ALL&limit=500");

  const started = await demoClient.post<ScanProgressDto>("/api/scan/start", {
    lookbackDays: 1095,
  });
  let progress = started;
  let steps = 0;
  while (!progress.done && steps < 200) {
    progress = await demoClient.post<ScanProgressDto>("/api/scan/step", {
      scanId: started.scanId,
    });
    steps += 1;
  }

  const after = await demoClient.get<SendersResponse>("/api/senders?status=ALL&limit=500");
  assert.ok(
    after.senders.length > before.senders.length,
    "a longer window finds more senders",
  );
});

test("one visitor's demo cannot change another visitor's", async () => {
  const list = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&sort=count");
  const target = list.senders[0];
  await demoClient.patch<SenderDto>(`/api/senders/${target.id}`, {
    status: SENDER_STATUS.KEPT,
  });

  const first = visitor;
  assert.ok(first.map.size > 0, "the first visitor's state is in their own storage");

  // A second visitor: a different browser, so different storage entirely.
  const second = makeStorage();
  (globalThis as { window?: unknown }).window = { localStorage: second.api };
  store.clearState();

  const fresh = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&sort=count");
  assert.ok(
    fresh.senders.some((sender) => sender.id === target.id),
    "the second visitor still sees the sender the first one kept",
  );
  assert.ok(first.map.size > 0, "and the first visitor's state is untouched");
});

test("resetting puts the demo back to exactly how it started", async () => {
  const before = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&sort=count");

  for (const sender of before.senders.slice(0, 3)) {
    await demoClient.patch<SenderDto>(`/api/senders/${sender.id}`, {
      status: SENDER_STATUS.KEPT,
    });
  }
  const changed = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&sort=count");
  assert.equal(changed.senders.length, before.senders.length - 3);

  store.clearState();

  const after = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&sort=count");
  assert.deepEqual(
    after.senders.map((sender) => sender.id),
    before.senders.map((sender) => sender.id),
  );
});

test("the demo still works when the browser refuses to store anything", async () => {
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: () => {
        throw new Error("site data blocked");
      },
      setItem: () => {
        throw new Error("site data blocked");
      },
      removeItem: () => {
        throw new Error("site data blocked");
      },
    },
  };
  store.clearState();

  const list = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&sort=count");
  assert.ok(list.senders.length > 0, "the demo falls back to memory rather than breaking");

  const target = list.senders.find((sender) => sender.canUnsubscribe)!;
  await demoClient.post<UnsubscribeResultDto>("/api/unsubscribe", { senderId: target.id });
  const after = await demoClient.get<SendersResponse>("/api/senders?status=ALL&limit=500");
  assert.notEqual(
    after.senders.find((sender) => sender.id === target.id)?.status,
    SENDER_STATUS.ACTIVE,
    "and actions still take effect for the rest of the visit",
  );
});

test("the demo works with no browser at all, so it can be server-rendered", async () => {
  delete (globalThis as { window?: unknown }).window;
  store.clearState();

  const list = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&sort=count");
  assert.ok(list.senders.length > 0);

  (globalThis as { window?: unknown }).window = { localStorage: visitor.api };
});

test("nothing outside the demo's own screens is reachable through it", async () => {
  for (const path of [
    "/api/auth/dev",
    "/api/auth/google/start",
    "/api/account",
    "/api/anything-else",
  ]) {
    await assert.rejects(
      () => demoClient.get(path),
      (error: unknown) => error instanceof ApiRequestError && error.status === 404,
      `${path} is not part of the demo`,
    );
  }

  assert.equal(fetchCalls, 0, "and no request left the browser at any point");
});

test("the demo's Home figures move after a confirmed unsubscribe, and only then", async () => {
  const before = await demoClient.get<StatsDto>("/api/stats");
  assert.ok(before.confirmedUnsubscribes > 0, "the sample mailbox starts with some removals");
  assert.ok((before.fewerEmailsPerMonth ?? 0) > 0);

  const list = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&limit=500");

  // Find one sender whose outcome is a confirmed removal and one that is not.
  let confirmedId: string | null = null;
  let pendingId: string | null = null;
  for (const sender of list.senders) {
    if (!sender.canUnsubscribe) continue;
    const result = await demoClient.post<UnsubscribeResultDto>("/api/unsubscribe", {
      senderId: sender.id,
    });
    if (result.status === SENDER_STATUS.UNSUBSCRIBED && !confirmedId) confirmedId = sender.id;
    if (result.status === SENDER_STATUS.REQUESTED && !pendingId) pendingId = sender.id;
    if (confirmedId && pendingId) break;
  }
  assert.ok(confirmedId && pendingId, "the sample includes both kinds of outcome");

  const after = await demoClient.get<StatsDto>("/api/stats");
  const confirmedNow = (
    await demoClient.get<SendersResponse>("/api/senders?status=UNSUBSCRIBED&limit=500")
  ).total;

  assert.equal(after.confirmedUnsubscribes, confirmedNow, "matches the Unsubscribed list exactly");
  assert.ok(after.fewerEmailsPerMonth! > before.fewerEmailsPerMonth!);
  assert.equal(
    Math.round(after.timeSavedPerMonthSeconds!),
    Math.round(after.fewerEmailsPerMonth! * 5),
  );

  const scan = await demoClient.get<ScanProgressDto>("/api/scan");
  assert.ok(scan.finishedAt, "the sample scan has a finish time for Recent activity");
  assert.equal(scan.lookbackDays, 30);
});

// --- Unsubscribed archive ---------------------------------------------------

type UnsubscribedResponse = import("../src/lib/api/types").UnsubscribedResponse;

async function runDemoScan(lookbackDays: number) {
  const started = await demoClient.post<ScanProgressDto>("/api/scan/start", { lookbackDays });
  let progress = started;
  for (let steps = 0; !progress.done && steps < 100; steps++) {
    progress = await demoClient.post<ScanProgressDto>("/api/scan/step", { scanId: started.scanId });
  }
  return progress;
}

test("the demo archive shows each follow-up state, from confirmed unsubscribes only", async () => {
  const archive = await demoClient.get<UnsubscribedResponse>("/api/unsubscribed?limit=50");
  const senders = await demoClient.get<SendersResponse>("/api/senders?status=UNSUBSCRIBED&limit=500");

  assert.equal(archive.archiveTotal, senders.total, "every confirmed unsubscribe, and nothing else");
  const states = new Map(archive.items.map((item) => [item.name, item]));

  const quiet = states.get("Verdant Grocery")!;
  assert.equal(quiet.observation, "NO_NEW_MAIL");

  const noisy = states.get("Strata Analytics")!;
  assert.equal(noisy.observation, "NEW_MAIL");
  assert.equal(noisy.newCount, 2);
  assert.ok(noisy.newMessages.every((m) => m.gmailUrl === null), "sample mail never pretends to open in Gmail");
  assert.ok(
    noisy.newMessages.every((m) => new Date(m.receivedAt) > new Date(noisy.unsubscribedAt!)),
    "only mail received after the unsubscribe",
  );

  const unchecked = states.get("Pinecrest Weekly")!;
  assert.equal(unchecked.observation, "NOT_CHECKED");
  assert.equal(unchecked.notCheckedReason, "NO_CHECK");

  for (const item of archive.items) {
    assert.equal(item.unsubscribePageUrl, null, "no real unsubscribe page is linked from the demo");
  }
  assert.equal(fetchCalls, 0);
});

test("requests, manual steps and failures never enter the demo archive", async () => {
  const archive = await demoClient.get<UnsubscribedResponse>("/api/unsubscribed?limit=50");
  const unconfirmed = await demoClient.get<SendersResponse>("/api/senders?status=ALL&limit=500");
  const archived = new Set(archive.items.map((item) => item.senderId));
  for (const sender of unconfirmed.senders) {
    if (sender.status !== SENDER_STATUS.UNSUBSCRIBED) {
      assert.equal(archived.has(sender.id), false, `${sender.name} is ${sender.status}`);
    }
  }
});

test("demo archive search and paging", async () => {
  const found = await demoClient.get<UnsubscribedResponse>("/api/unsubscribed?search=strata");
  assert.deepEqual(found.items.map((item) => item.name), ["Strata Analytics"]);
  assert.equal(found.total, 1);
  assert.ok(found.archiveTotal > 1, "the archive total stays the whole archive");

  const first = await demoClient.get<UnsubscribedResponse>("/api/unsubscribed?limit=1&offset=0");
  const second = await demoClient.get<UnsubscribedResponse>("/api/unsubscribed?limit=1&offset=1");
  assert.notEqual(first.items[0].senderId, second.items[0].senderId);
});

test("a demo check is local, and a stopped one changes nothing", async () => {
  const before = await demoClient.get<UnsubscribedResponse>("/api/unsubscribed?limit=50");

  // Started and abandoned: still running, so it is no check at all.
  await demoClient.post<ScanProgressDto>("/api/scan/start", { lookbackDays: before.checkLookbackDays });
  const stopped = await demoClient.get<UnsubscribedResponse>("/api/unsubscribed?limit=50");
  assert.equal(stopped.lastCheck?.finishedAt, before.lastCheck?.finishedAt);

  const done = await runDemoScan(before.checkLookbackDays);
  assert.equal(done.status, "DONE");
  const after = await demoClient.get<UnsubscribedResponse>("/api/unsubscribed?limit=50");
  assert.notEqual(after.lastCheck?.finishedAt, before.lastCheck?.finishedAt);

  // Checked minutes after unsubscribing: too soon to say it went quiet.
  const pinecrest = after.items.find((item) => item.name === "Pinecrest Weekly")!;
  assert.equal(pinecrest.observation, "NOT_CHECKED");
  assert.equal(pinecrest.notCheckedReason, "TOO_SOON");
  assert.equal(after.items.find((item) => item.name === "Strata Analytics")?.newCount, 2);
  assert.equal(fetchCalls, 0);
});

test("resetting the demo restores the archive's sample states", async () => {
  const before = await demoClient.get<UnsubscribedResponse>("/api/unsubscribed?limit=50");
  await runDemoScan(30);
  store.clearState();
  const after = await demoClient.get<UnsubscribedResponse>("/api/unsubscribed?limit=50");
  assert.deepEqual(
    after.items.map((item) => [item.name, item.observation]),
    before.items.map((item) => [item.name, item.observation]),
  );
});

// --- Keeping ------------------------------------------------------------------

test("in the demo, Keep moves a sender to Keeping and Move to review brings it back", async () => {
  const review = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&limit=500");
  const keeping = await demoClient.get<SendersResponse>("/api/senders?status=KEPT&limit=500");
  const target = review.senders[0];

  await demoClient.patch<SenderDto>(`/api/senders/${target.id}`, { status: SENDER_STATUS.KEPT });
  const afterKeep = await demoClient.get<SendersResponse>("/api/senders?status=KEPT&limit=500");
  assert.ok(afterKeep.senders.some((s) => s.id === target.id));
  assert.equal(afterKeep.counts.KEPT, keeping.counts.KEPT + 1);
  assert.equal(afterKeep.counts.ACTIVE, review.counts.ACTIVE - 1);

  const attemptsBefore = await demoClient.get<HistoryItemDto[]>("/api/history");
  await demoClient.patch<SenderDto>(`/api/senders/${target.id}`, { status: SENDER_STATUS.ACTIVE });
  const afterMove = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&limit=500");
  assert.ok(afterMove.senders.some((s) => s.id === target.id));
  assert.equal(afterMove.counts.KEPT, keeping.counts.KEPT);
  assert.equal(afterMove.counts.ACTIVE, review.counts.ACTIVE);

  const attemptsAfter = await demoClient.get<HistoryItemDto[]>("/api/history");
  assert.equal(attemptsAfter.length, attemptsBefore.length, "moving to review never unsubscribes");
  assert.equal(fetchCalls, 0);
});

test("a simulated rescan, of any window, preserves Keep decisions", async () => {
  const review = await demoClient.get<SendersResponse>("/api/senders?status=ACTIVE&limit=500");
  await demoClient.patch<SenderDto>(`/api/senders/${review.senders[1].id}`, { status: SENDER_STATUS.KEPT });
  const before = await demoClient.get<SendersResponse>("/api/senders?status=KEPT&limit=500");

  for (const days of [30, 1095]) {
    const started = await demoClient.post<ScanProgressDto>("/api/scan/start", { lookbackDays: days });
    let progress = started;
    for (let steps = 0; !progress.done && steps < 100; steps++) {
      progress = await demoClient.post<ScanProgressDto>("/api/scan/step", { scanId: started.scanId });
    }
    const after = await demoClient.get<SendersResponse>("/api/senders?status=KEPT&limit=500");
    assert.deepEqual(
      after.senders.map((s) => s.id).sort(),
      before.senders.map((s) => s.id).sort(),
      `a ${days}-day scan keeps every kept sender kept`,
    );
  }
});

test("resetting the demo restores its sample kept senders", async () => {
  const initial = await demoClient.get<SendersResponse>("/api/senders?status=KEPT&limit=500");
  assert.ok(initial.total > 0, "the sample starts with someone in Keeping");

  for (const sender of initial.senders) {
    await demoClient.patch<SenderDto>(`/api/senders/${sender.id}`, { status: SENDER_STATUS.ACTIVE });
  }
  assert.equal((await demoClient.get<SendersResponse>("/api/senders?status=KEPT")).total, 0);

  store.clearState();
  const reset = await demoClient.get<SendersResponse>("/api/senders?status=KEPT&limit=500");
  assert.deepEqual(reset.senders.map((s) => s.id), initial.senders.map((s) => s.id));
});

test("follow-up outcomes stay reachable from Cleanup's To review filters", async () => {
  for (const status of ["MANUAL", "FAILED", "REQUESTED"]) {
    const list = await demoClient.get<SendersResponse>(`/api/senders?status=${status}&limit=500`);
    assert.equal(list.total, list.counts[status as keyof typeof list.counts], `${status} is listed`);
    assert.ok(list.total > 0, `the sample has a ${status} sender to show`);
  }
});
