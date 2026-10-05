import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

/**
 * The demo's two sample mailboxes: switching works, each has its own data,
 * and — like the rest of the demo — nothing reaches a server. Same hostile
 * setup as demo.test.ts: a nonsense database URL and a fetch that throws.
 */

process.env.DATABASE_URL = "file:/nonexistent/should-never-be-opened.db";
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;

const realFetch = globalThis.fetch;

function storage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as unknown as Storage;
}

let demo: typeof import("../src/lib/demo/client");
let store: typeof import("../src/lib/demo/store");
let scoped: typeof import("../src/lib/api/scoped");
let constants: typeof import("../src/lib/constants");
type SessionDto = import("../src/lib/api/types").SessionDto;
type SendersResponse = import("../src/lib/api/types").SendersResponse;
type StatsDto = import("../src/lib/api/types").StatsDto;
type HistoryItemDto = import("../src/lib/api/types").HistoryItemDto;
type ClearOutListResponse = import("../src/lib/api/types").ClearOutListResponse;
type ScanProgressDto = import("../src/lib/api/types").ScanProgressDto;

before(async () => {
  globalThis.fetch = (async () => {
    throw new Error("the demo must never make a network request");
  }) as typeof fetch;
  (globalThis as { window?: unknown }).window = { localStorage: storage(), sessionStorage: storage() };
  demo = await import("../src/lib/demo/client");
  store = await import("../src/lib/demo/store");
  scoped = await import("../src/lib/api/scoped");
  constants = await import("../src/lib/constants");
});

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: storage(), sessionStorage: storage() };
  store.clearState();
});

after(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as { window?: unknown }).window;
});

const forBox = (id: string) =>
  scoped.createMailboxClient(demo.demoClient, id, { signal: new AbortController().signal });

test("the demo has two sample mailboxes with names, and opens on the first", async () => {
  const session = await demo.demoClient.get<SessionDto>("/api/me");
  assert.deepEqual(
    session.mailboxes.map((mailbox) => [mailbox.label, mailbox.email]),
    [
      ["Personal", "sam.rivers@example.com"],
      ["Work", "sam@northwind.example.com"],
    ],
  );
  assert.equal(session.activeMailboxId, session.mailboxes[0].id);
  for (const mailbox of session.mailboxes) assert.match(mailbox.email, /example\.com$/);
});

test("each sample mailbox shows its own senders, stats, history and Clear out mail", async () => {
  const { mailboxes } = await demo.demoClient.get<SessionDto>("/api/me");
  const [personal, work] = mailboxes.map((mailbox) => forBox(mailbox.id));

  const personalSenders = await personal.get<SendersResponse>("/api/senders?status=ALL&limit=500");
  const workSenders = await work.get<SendersResponse>("/api/senders?status=ALL&limit=500");
  const overlap = personalSenders.senders.filter((a) => workSenders.senders.some((b) => b.id === a.id));
  assert.equal(overlap.length, 0, "no sender appears in both");
  assert.ok(workSenders.total > 0 && personalSenders.total > workSenders.total);

  const personalStats = await personal.get<StatsDto>("/api/stats");
  const workStats = await work.get<StatsDto>("/api/stats");
  assert.notEqual(personalStats.totalSenders, workStats.totalSenders);

  const personalMail = await personal.get<ClearOutListResponse>("/api/clear-out/messages?pageSize=50");
  const workMail = await work.get<ClearOutListResponse>("/api/clear-out/messages?pageSize=50");
  assert.ok(workMail.messages.every((m) => !personalMail.messages.some((p) => p.id === m.id)));

  const search = await work.get<SendersResponse>("/api/senders?status=ALL&search=kettle");
  assert.equal(search.total, 0, "search stays inside the mailbox");
});

test("an action in one sample mailbox changes nothing in the other", async () => {
  const { mailboxes } = await demo.demoClient.get<SessionDto>("/api/me");
  const [personal, work] = mailboxes.map((mailbox) => forBox(mailbox.id));
  const personalBefore = await personal.get<HistoryItemDto[]>("/api/history");

  const target = (await work.get<SendersResponse>("/api/senders?status=ACTIVE")).senders.find((s) => s.canOneClick)!;
  await work.post("/api/unsubscribe", { senderId: target.id });
  await work.patch(`/api/senders/${(await work.get<SendersResponse>("/api/senders?status=ACTIVE")).senders[0].id}`, {
    status: constants.SENDER_STATUS.KEPT,
  });

  assert.deepEqual(await personal.get<HistoryItemDto[]>("/api/history"), personalBefore);
  // A sender id from one mailbox is unknown in the other.
  await assert.rejects(personal.post("/api/unsubscribe", { senderId: target.id }), { status: 404 });

  // A scan runs in the mailbox it was started from.
  const started = await work.post<ScanProgressDto>("/api/scan/start", { lookbackDays: 30 });
  assert.equal((await personal.get<ScanProgressDto>("/api/scan"))?.scanId === started.scanId, false);
});

test("switching is remembered, unknown mailboxes are refused, and a reset clears both", async () => {
  const { mailboxes } = await demo.demoClient.get<SessionDto>("/api/me");
  await demo.demoClient.post("/api/mailboxes/active", { mailboxId: mailboxes[1].id });
  assert.equal((await demo.demoClient.get<SessionDto>("/api/me")).activeMailboxId, mailboxes[1].id);

  await assert.rejects(forBox("someone-elses").get("/api/stats"), { status: 404 });
  await assert.rejects(demo.demoClient.post("/api/mailboxes/active", { mailboxId: "nope" }), { status: 404 });

  const work = forBox(mailboxes[1].id);
  const kept = (await work.get<SendersResponse>("/api/senders?status=ACTIVE")).senders[0];
  await work.patch(`/api/senders/${kept.id}`, { status: constants.SENDER_STATUS.KEPT });
  store.clearState();
  const fresh = await work.get<SendersResponse>("/api/senders?status=ACTIVE");
  assert.ok(fresh.senders.some((s) => s.id === kept.id), "the work mailbox was reset too");
});
