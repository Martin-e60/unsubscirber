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
