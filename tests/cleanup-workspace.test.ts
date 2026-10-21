import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

/**
 * The unified Cleanup workspace: a sender's mail beside their decision.
 *
 * What the screen promises, pinned down at the layers that can be run without a
 * browser: a sender's messages are matched by exact address, the monthly
 * frequency and the number of matching messages are different things, a
 * subscription decision never touches a message, an action on messages never
 * touches a subscription, and a selection says honestly what it covers.
 *
 * Same hostile setup as the other demo tests: a nonsense database URL and a
 * fetch that throws, so nothing here can reach Gmail or a real mailbox.
 */

process.env.DATABASE_URL = "file:/nonexistent/should-never-be-opened.db";

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

type Api = import("../src/lib/api/client").ApiClient;
type SendersResponse = import("../src/lib/api/types").SendersResponse;
type SenderDto = import("../src/lib/api/types").SenderDto;
type ListResponse = import("../src/lib/api/types").ClearOutListResponse;
type RunDto = import("../src/lib/api/types").ClearOutRunDto;

let demoClient: Api;
let store: typeof import("../src/lib/demo/store");
let scoped: typeof import("../src/lib/api/scoped");
let filters: typeof import("../src/lib/clearout/filters");
let selection: typeof import("../src/lib/clearout/selection");
let navigation: typeof import("../src/lib/navigation");
let derive: typeof import("../src/lib/senders/derive");

before(async () => {
  globalThis.fetch = (async () => {
    throw new Error("the demo must never make a network request");
  }) as typeof fetch;
  (globalThis as { window?: unknown }).window = { localStorage: storage(), sessionStorage: storage() };
  ({ demoClient } = await import("../src/lib/demo/client"));
  store = await import("../src/lib/demo/store");
  scoped = await import("../src/lib/api/scoped");
  filters = await import("../src/lib/clearout/filters");
  selection = await import("../src/lib/clearout/selection");
  navigation = await import("../src/lib/navigation");
  derive = await import("../src/lib/senders/derive");
});

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: storage(), sessionStorage: storage() };
  store.clearState();
});

after(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as { window?: unknown }).window;
});

const KETTLE = "hello@kettleandcrumb.example.com";

async function senders(api: Api = demoClient): Promise<SenderDto[]> {
  return (await api.get<SendersResponse>("/api/senders?status=ALL&limit=200")).senders;
}

/** What the message pane asks for when a sender is focused. */
function mailOf(address: string, api: Api = demoClient): Promise<ListResponse> {
  const query = filters.toQuery(filters.filterForSender(filters.EMPTY_FILTER, address));
  return api.get<ListResponse>(`/api/clear-out/messages?${filters.queryParams(query)}&pageSize=50`);
}

async function runAction(action: string, ids: string[], extra: Record<string, unknown> = {}) {
  const run = await demoClient.post<RunDto>("/api/clear-out/runs", { action, requested: ids.length, ...extra });
  return demoClient.post<{ succeeded: string[]; failed: string[] }>(`/api/clear-out/runs/${run.id}`, { ids });
}

// --- A sender's mail ----------------------------------------------------------------------

test("every sender Cleanup lists has mail under its own exact address, in both sample mailboxes", async () => {
  for (const box of ["demo-mailbox", "demo-work"]) {
    const api = scoped.createMailboxClient(demoClient, box, { signal: new AbortController().signal });
    const list = await senders(api);
    assert.ok(list.length > 5, `${box} has senders`);

    for (const sender of list) {
      const mail = await mailOf(sender.address, api);
      assert.ok(mail.total > 0, `${sender.address} in ${box} has messages to organise`);
      for (const message of mail.messages) {
        assert.equal(message.fromAddress.toLowerCase(), sender.address.toLowerCase());
      }
    }
  }
});

test("one sender's mail is matched by exact address, never by company or name", async () => {
  // Two different people at the same company, in the sample mailbox.
  const all = store.loadState().mailbox;
  const studio = all.filter((m) => m.fromAddress.endsWith("@studionorth.example.com"));
  const addresses = new Set(studio.map((m) => m.fromAddress));
  assert.ok(addresses.size >= 2, "the sample has two senders at one domain");

  for (const address of addresses) {
    const mail = await mailOf(address);
    assert.ok(mail.messages.length > 0);
    assert.deepEqual([...new Set(mail.messages.map((m) => m.fromAddress))], [address]);
    assert.equal(mail.total, studio.filter((m) => m.fromAddress === address).length);
  }

  // An address typed in the wrong case still means the same sender.
  const upper = await mailOf(KETTLE.toUpperCase());
  const lower = await mailOf(KETTLE);
  assert.equal(upper.total, lower.total);
});

test("monthly frequency and the number of matching messages are different figures", async () => {
  const kettle = (await senders()).find((sender) => sender.address === KETTLE)!;
  const mail = await mailOf(KETTLE);

  // The frequency is how often the sender writes, from what a scan saw...
  assert.equal(
    kettle.perMonth,
    derive.emailsPerMonth({
      messageCount: kettle.messageCount,
      firstSeenAt: kettle.firstSeenAt ? new Date(kettle.firstSeenAt) : null,
      lastSeenAt: kettle.lastSeenAt ? new Date(kettle.lastSeenAt) : null,
    }),
  );
  // ...the count beside the list is how many messages match right now.
  assert.equal(mail.total, store.loadState().mailbox.filter((m) => m.fromAddress === KETTLE).length);
  assert.equal(mail.totalExact, true);
  assert.notEqual(mail.total, kettle.messageCount, "not the scan's tally either");
});

// --- Decisions and organising stay apart -------------------------------------------------

test("keeping, moving back and unsubscribing never touch a message", async () => {
  const before = JSON.stringify(store.loadState().mailbox);
  const list = await senders();
  const waiting = list.filter((sender) => sender.status === "ACTIVE" && sender.canUnsubscribe).slice(0, 2);
  assert.equal(waiting.length, 2);

  await demoClient.patch(`/api/senders/${waiting[0].id}`, { status: "KEPT" });
  await demoClient.patch(`/api/senders/${waiting[0].id}`, { status: "ACTIVE" });
  const result = await demoClient.post<{ status: string }>("/api/unsubscribe", { senderId: waiting[1].id });
  assert.notEqual(result.status, "ACTIVE", "the decision itself did happen");

  assert.equal(JSON.stringify(store.loadState().mailbox), before, "no message was archived, trashed, labelled or read");
});

test("marking, labelling, archiving and trashing never change a subscription", async () => {
  const before = JSON.stringify((await senders()).map((s) => [s.id, s.status, s.canUnsubscribe, s.manualUrl]));
  const ids = (await mailOf(KETTLE)).messages.map((m) => m.id);
  assert.ok(ids.length >= 4);

  assert.equal((await runAction("mark_read", ids.slice(0, 1))).succeeded.length, 1);
  assert.equal((await runAction("label", ids.slice(1, 2), { labelId: "Label_receipts" })).succeeded.length, 1);
  assert.equal((await runAction("archive", ids.slice(2, 3))).succeeded.length, 1);
  assert.equal((await runAction("trash", ids.slice(3, 4))).succeeded.length, 1);

  assert.equal(
    JSON.stringify((await senders()).map((s) => [s.id, s.status, s.canUnsubscribe, s.manualUrl])),
    before,
    "Keep, Unsubscribe and every outcome are exactly as they were",
  );
});

test("moving mail to Trash only moves it: nothing is deleted for good", async () => {
  const ids = (await mailOf(KETTLE)).messages.map((m) => m.id);
  await runAction("trash", ids.slice(0, 2));
  const all = store.loadState().mailbox;
  for (const id of ids.slice(0, 2)) {
    const message = all.find((m) => m.id === id);
    assert.ok(message, "still there");
    assert.ok(message.labelIds.includes("TRASH"));
  }
  assert.equal((await mailOf(KETTLE)).total, ids.length - 2, "gone from the sender's list, as Gmail does");
});

// --- A selection says what it covers --------------------------------------------------------

test("the selection reports its scope truthfully", () => {
  const page = ["a", "b", "c", "d"];
  const none = new Set<string>();
  const some = new Set(["a", "b"]);
  const every = new Set(page);
  const elsewhere = new Set(["a", "z"]);

  assert.equal(selection.pageSelection(none, page), "none");
  assert.equal(selection.pageSelection(some, page), "some", "partial page selection is indeterminate");
  assert.equal(selection.pageSelection(every, page), "all");
  assert.equal(selection.pageSelection(some, []), "none");

  assert.equal(selection.selectionScope({ selected: none, pageIds: page, allMatching: null }), null);
  assert.equal(selection.selectionScope({ selected: some, pageIds: page, allMatching: null })?.short, "on this page");
  assert.equal(
    selection.selectionScope({ selected: elsewhere, pageIds: page, allMatching: null })?.short,
    "across pages",
    "something selected is not on this page",
  );
  assert.equal(selection.selectionScope({ selected: every, pageIds: page, allMatching: { capped: false } })?.short, "all matching");
  const capped = selection.selectionScope({ selected: every, pageIds: page, allMatching: { capped: true } });
  assert.equal(capped?.short, "limit reached");
  assert.match(capped!.long, /5,000/);
});

test("Select all is offered only while there is more to select", () => {
  const offer = selection.offersSelectAll;
  assert.equal(offer({ allMatching: null, total: 20, morePages: true, pageAll: false }), true);
  assert.equal(offer({ allMatching: null, total: 20, morePages: true, pageAll: true }), true, "the page is done, the rest is not");
  assert.equal(offer({ allMatching: null, total: 5, morePages: false, pageAll: false }), true);
  assert.equal(offer({ allMatching: null, total: 5, morePages: false, pageAll: true }), false, "everything is already selected");
  assert.equal(offer({ allMatching: { capped: false }, total: 20, morePages: true, pageAll: true }), false);
  assert.equal(offer({ allMatching: null, total: 0, morePages: false, pageAll: false }), false, "nothing to select");
});

test("a sender's filter keeps the person's own filters and replaces only the sender", () => {
  const mine = { ...filters.EMPTY_FILTER, unread: true, older: "6m", senders: ["someone@else.example.com"] };
  const focused = filters.filterForSender(mine, "News@Example.com ");
  assert.deepEqual(focused.senders, ["news@example.com"]);
  assert.equal(focused.unread, true);
  assert.equal(focused.older, "6m");
  assert.notEqual(filters.filterKey(focused), filters.filterKey(mine), "a different sender is a different result set");
});

// --- Opening a sender from a link --------------------------------------------------------------

test("a sender named by a link opens in the list that holds it", () => {
  assert.deepEqual(navigation.senderPlace("ACTIVE"), { view: "review", status: null });
  assert.deepEqual(navigation.senderPlace("KEPT"), { view: "keeping", status: null });
  assert.deepEqual(navigation.senderPlace("MANUAL"), { view: "review", status: "MANUAL" });
  assert.deepEqual(navigation.senderPlace("FAILED"), { view: "review", status: "FAILED" });
  assert.deepEqual(navigation.senderPlace("REQUESTED"), { view: "review", status: "REQUESTED" });
  assert.equal(navigation.senderPlace("UNSUBSCRIBED"), null, "confirmed removals live in Unsubscribed");
  assert.equal(navigation.senderPlace("ROLLED_UP"), null);
});
