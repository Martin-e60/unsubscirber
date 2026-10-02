import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

/**
 * Clear out: the filter rules, the Gmail query they become, the batches that
 * change mail, and the demo that must never leave the browser.
 *
 * Dates are checked in a fixed timezone far from UTC, so "midnight" means the
 * person's midnight and not the server's.
 */

process.env.TZ = "Asia/Tokyo";
process.env.DATABASE_URL = "file:/nonexistent/should-never-be-opened.db";

const realFetch = globalThis.fetch;
let fetchCalls = 0;

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

type Filters = typeof import("../src/lib/clearout/filters");
type Actions = typeof import("../src/lib/clearout/actions");
let f: Filters;
let actions: Actions;
let applyBatch: typeof import("../src/lib/clearout/apply")["applyBatch"];
let demoClient: typeof import("../src/lib/demo/client")["demoClient"];
let store: typeof import("../src/lib/demo/store");
let constants: typeof import("../src/lib/constants");
let toMessageDto: typeof import("../src/lib/clearout/map")["toMessageDto"];

type ListResponse = import("../src/lib/api/types").ClearOutListResponse;
type RunDto = import("../src/lib/api/types").ClearOutRunDto;
type ChunkResponse = import("../src/lib/api/types").ClearOutChunkResponse;
type ResolveResponse = import("../src/lib/api/types").ClearOutResolveResponse;

before(async () => {
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("Clear out's demo must never make a network request");
  }) as typeof fetch;
  (globalThis as { window?: unknown }).window = { localStorage: visitor.api };

  f = await import("../src/lib/clearout/filters");
  actions = await import("../src/lib/clearout/actions");
  ({ applyBatch } = await import("../src/lib/clearout/apply"));
  ({ demoClient } = await import("../src/lib/demo/client"));
  store = await import("../src/lib/demo/store");
  constants = await import("../src/lib/constants");
  ({ toMessageDto } = await import("../src/lib/clearout/map"));
});

beforeEach(() => {
  visitor = makeStorage();
  (globalThis as { window?: unknown }).window = { localStorage: visitor.api };
  store.clearState();
});

after(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as { window?: unknown }).window;
});

// --- Filters and the URL -----------------------------------------------------------

test("filters survive the URL and drop anything malformed", () => {
  const filter = f.parseFilter(
    new URLSearchParams(
      "from=Maya.Chen@Example.org&from=not-an-address&from=maya.chen@example.org&older=6m&unread=1&attachments=1&larger=10&unsubscribed=1&label=Label_work&q=invoice",
    ),
  );
  assert.deepEqual(filter.senders, ["maya.chen@example.org"], "lowercased, deduplicated, junk dropped");
  assert.equal(filter.older, "6m");
  assert.equal(filter.unread, true);
  assert.equal(filter.attachments, true);
  assert.equal(filter.larger, 10);
  assert.equal(filter.unsubscribed, true);
  assert.deepEqual(filter.scope, { kind: "label", id: "Label_work" });
  assert.equal(filter.search, "invoice");

  const round = f.parseFilter(f.filterParams(filter));
  assert.deepEqual(round, filter, "serialising and parsing again changes nothing");

  const odd = f.parseFilter(new URLSearchParams("older=2026-02-30&larger=7&scope=everything"));
  assert.equal(odd.older, null, "a date that does not exist is ignored");
  assert.equal(odd.larger, null, "only the offered sizes");
  assert.deepEqual(odd.scope, { kind: "all" });
});

test("clearing filters keeps the mailbox scope and the search", () => {
  const filter = f.parseFilter(new URLSearchParams("from=a@example.com&unread=1&scope=inbox&q=hello"));
  const cleared = f.clearFilters(filter);
  assert.equal(f.hasFilters(cleared), false);
  assert.deepEqual(cleared.scope, { kind: "inbox" });
  assert.equal(cleared.search, "hello");
  assert.notEqual(f.filterKey(filter), f.filterKey(cleared), "a different result set, so selection resets");
});

// --- Dates --------------------------------------------------------------------------

test("an 'older than' cutoff is local midnight, on the same calendar day", () => {
  // 2 October 2026, 00:30 in Tokyo — still 1 October in UTC.
  const now = new Date(2026, 9, 2, 0, 30);
  const cutoff = f.cutoffFor("6m", now)!;
  assert.equal(cutoff.getFullYear(), 2026);
  assert.equal(cutoff.getMonth(), 3, "April");
  assert.equal(cutoff.getDate(), 2, "the same day of the month, in the person's timezone");
  assert.equal(cutoff.getHours(), 0);
  assert.equal(cutoff.toISOString(), "2026-04-01T15:00:00.000Z", "Tokyo midnight, not UTC midnight");

  assert.equal(f.isoDay(f.cutoffFor("3m", now)!), "2026-07-02");
  assert.equal(f.isoDay(f.cutoffFor("1y", now)!), "2025-10-02");
});

test("a day the shorter month lacks clamps to that month's end", () => {
  assert.equal(f.isoDay(f.cutoffFor("6m", new Date(2026, 7, 31, 12))!), "2026-02-28");
  assert.equal(f.isoDay(f.cutoffFor("6m", new Date(2028, 7, 31, 12))!), "2028-02-29", "leap year");
  assert.equal(f.isoDay(f.cutoffFor("3m", new Date(2026, 4, 31, 12))!), "2026-02-28");
});

test("a custom cutoff date is midnight at the start of that day, described in words", () => {
  const cutoff = f.cutoffFor("2026-01-15")!;
  assert.equal(f.isoDay(cutoff), "2026-01-15");
  assert.equal(cutoff.getHours(), 0);
  assert.match(f.describeCutoff("2026-01-15")!, /before 15 January 2026, counted from midnight/);
  assert.equal(f.olderLabel("2026-01-15"), "Before 15 Jan 2026");
  assert.equal(f.olderLabel("6m"), "Older than 6 months");
});

test("the cutoff is exclusive: midnight itself is not older", () => {
  const before = f.cutoffFor("2026-01-15")!.getTime();
  const query = { ...f.toQuery(f.EMPTY_FILTER), before };
  const at = (ms: number) => message({ receivedAt: ms });
  assert.equal(f.matchesQuery(at(before - 1), query), true, "one millisecond before midnight");
  assert.equal(f.matchesQuery(at(before), query), false, "midnight is the new day");
});

// --- The Gmail query ------------------------------------------------------------------

test("different filters combine with AND; several senders with OR", () => {
  const filter: import("../src/lib/clearout/filters").ClearOutFilter = {
    ...f.EMPTY_FILTER,
    senders: ["maya@example.org", "alex@example.net"],
    older: "2026-04-02",
    unread: true,
    attachments: true,
    larger: 10,
  };
  const query = f.toQuery(filter);
  const search = f.gmailSearch(query)!;
  assert.equal(
    search.q,
    `-in:drafts -in:chats {from:maya@example.org from:alex@example.net} before:${Math.floor(query.before! / 1000)} is:unread has:attachment larger:10M`,
  );
  assert.deepEqual(search.labelIds, [], "All mail is not narrowed to a label");
  assert.equal(query.before, new Date(2026, 3, 2).getTime(), "an epoch instant, not a PST date string");
});

test("scope maps to label ids; drafts and chats are always excluded", () => {
  const inbox = f.gmailSearch(f.toQuery({ ...f.EMPTY_FILTER, scope: { kind: "inbox" } }))!;
  assert.deepEqual(inbox.labelIds, ["INBOX"]);
  const label = f.gmailSearch(f.toQuery({ ...f.EMPTY_FILTER, scope: { kind: "label", id: "Label_7" } }))!;
  assert.deepEqual(label.labelIds, ["Label_7"]);
  assert.match(label.q, /-in:drafts -in:chats/);
});

test("free-text search cannot smuggle in Gmail operators", () => {
  const terms = f.searchTerms('invoice -in:trash {from:x} "quoted" (a OR b)');
  const q = f.gmailSearch({ ...f.toQuery(f.EMPTY_FILTER), search: 'invoice -in:trash {from:x}' })!.q;
  assert.ok(terms.every((term) => !/["{}()]/.test(term)));
  assert.match(q, /"invoice" "in:trash" "from:x"$/, "each word is quoted, a leading minus is dropped");
});

test("From unsubscribed uses each list's exact address and List-Ids", () => {
  const query = { ...f.toQuery(f.EMPTY_FILTER), unsubscribed: true };
  const lists = [
    { address: "news@kettle.example.com", listIds: ["weekly.kettle.example.com"] },
    { address: "offers@nimbus.example.com", listIds: [] },
  ];
  const q = f.gmailSearch(query, lists)!.q;
  assert.match(q, /\{\(from:news@kettle\.example\.com list:weekly\.kettle\.example\.com\) from:offers@nimbus\.example\.com\}/);
  assert.equal(f.gmailSearch(query, []), null, "no unsubscribes means nothing can match");

  // A receipt from the same address without the List-Id, and another address
  // at the same domain, are not the list.
  const newsletter = message({ fromAddress: "news@kettle.example.com", listId: "weekly.kettle.example.com" });
  const receipt = message({ fromAddress: "news@kettle.example.com", listId: null });
  const sameDomain = message({ fromAddress: "orders@kettle.example.com", listId: "weekly.kettle.example.com" });
  assert.equal(f.matchesQuery(newsletter, query, lists), true);
  assert.equal(f.matchesQuery(receipt, query, lists), false);
  assert.equal(f.matchesQuery(sameDomain, query, lists), false);
});

test("malformed API queries are refused rather than widened", () => {
  assert.throws(() => f.readQuery({ from: ["not an address"] }), f.QueryError);
  assert.throws(() => f.readQuery({ before: "yesterday" }), f.QueryError);
  assert.throws(() => f.readQuery({ larger: 7 }), f.QueryError);
  assert.throws(() => f.readQuery({ scope: "label" }), f.QueryError, "a label scope needs a label");
  assert.throws(() => f.readQuery({ scope: "label", label: "x y" }), f.QueryError);
  const ok = f.readQuery(new URLSearchParams("from=A@Example.com&unread=1&scope=inbox"));
  assert.deepEqual(ok.from, ["a@example.com"]);
  assert.equal(ok.unread, true);
  assert.equal(ok.scope, "inbox");
});

// --- Permissions ----------------------------------------------------------------------

test("read access lists mail; only modify (or full) access organises it", () => {
  const { scopeAccess, GOOGLE_SCOPES, GMAIL_MODIFY_SCOPE } = constants;
  assert.deepEqual(scopeAccess(GOOGLE_SCOPES.join(" ")), { canRead: true, canOrganise: false });
  assert.deepEqual(scopeAccess(`${GOOGLE_SCOPES.join(" ")} ${GMAIL_MODIFY_SCOPE}`), { canRead: true, canOrganise: true });
  assert.deepEqual(
    scopeAccess("https://www.googleapis.com/auth/gmail.metadata"),
    { canRead: false, canOrganise: false },
    "metadata-only access cannot run a search",
  );
  assert.ok(!GOOGLE_SCOPES.includes("https://mail.google.com/"), "the full scope is never requested");
  assert.ok(!GOOGLE_SCOPES.includes(GMAIL_MODIFY_SCOPE), "a first connection does not ask to organise");
});

test("the organise reconnect adds modify, keeps granted scopes, and hints the same mailbox", async () => {
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  const { getAuthorizationUrl } = await import("../src/lib/google/oauth");

  const plain = new URL(getAuthorizationUrl("s1"));
  assert.ok(!plain.searchParams.get("scope")!.includes("gmail.modify"));

  const organise = new URL(
    getAuthorizationUrl("s2", { extraScopes: [constants.GMAIL_MODIFY_SCOPE], loginHint: "sam@example.com" }),
  );
  const scopes = organise.searchParams.get("scope")!.split(" ");
  assert.ok(scopes.includes(constants.GMAIL_MODIFY_SCOPE));
  assert.ok(scopes.includes("https://www.googleapis.com/auth/gmail.send"), "existing capabilities are kept");
  assert.ok(!scopes.includes("https://mail.google.com/"));
  assert.equal(organise.searchParams.get("include_granted_scopes"), "true");
  assert.equal(organise.searchParams.get("login_hint"), "sam@example.com");
});

// --- Changing mail ----------------------------------------------------------------------

/** A mailbox with one conversation of three messages. */
function fakeOrganiser(options: { failIds?: string[]; permission?: boolean } = {}) {
  const labels = new Map<string, string[]>([
    ["m1", ["INBOX", "UNREAD", "Label_family"]],
    ["m2", ["INBOX", "UNREAD"]],
    ["m3", ["INBOX", "UNREAD"]],
  ]);
  const calls: string[][] = [];
  const organiser: import("../src/lib/mail/provider").MailOrganiser = {
    async searchMessages() {
      return { ids: [], nextPageToken: null, estimate: 0 };
    },
    async getMetadata() {
      return [];
    },
    async listLabels() {
      return [];
    },
    async modifyLabels(ids, add, remove) {
      calls.push(ids);
      if (options.permission) throw Object.assign(new Error("insufficient"), { isPermission: true });
      if (ids.some((id) => options.failIds?.includes(id))) throw new Error("Gmail API 400");
      for (const id of ids) {
        const next = labels.get(id)!.filter((label) => !remove.includes(label));
        for (const label of add) if (!next.includes(label)) next.push(label);
        labels.set(id, next);
      }
    },
    async trashMessages(ids) {
      for (const id of ids) labels.set(id, [...labels.get(id)!, "TRASH"]);
      return { succeeded: ids, failed: [] };
    },
  };
  return { organiser, labels, calls };
}

test("an action changes exactly the selected messages, never the rest of the thread", async () => {
  const box = fakeOrganiser();
  const result = await applyBatch(box.organiser, { action: "archive", labelId: null }, ["m2"]);
  assert.deepEqual(result, { succeeded: ["m2"], failed: [] });
  assert.deepEqual(box.labels.get("m2"), ["UNREAD"]);
  assert.deepEqual(box.labels.get("m1"), ["INBOX", "UNREAD", "Label_family"], "same conversation, untouched");
  assert.deepEqual(box.labels.get("m3"), ["INBOX", "UNREAD"]);
});

test("Label adds one label and leaves the others; Mark as read removes only UNREAD", async () => {
  const box = fakeOrganiser();
  await applyBatch(box.organiser, { action: "label", labelId: "Label_work" }, ["m1"]);
  assert.deepEqual(box.labels.get("m1"), ["INBOX", "UNREAD", "Label_family", "Label_work"]);
  await applyBatch(box.organiser, { action: "mark_read", labelId: null }, ["m1"]);
  assert.deepEqual(box.labels.get("m1"), ["INBOX", "Label_family", "Label_work"]);
  assert.throws(() => actions.labelChange("label", null), "Label needs a label");
});

test("a failed batch is retried one by one, so successes and failures are reported exactly", async () => {
  const box = fakeOrganiser({ failIds: ["m2"] });
  const result = await applyBatch(box.organiser, { action: "archive", labelId: null }, ["m1", "m2", "m3"]);
  assert.deepEqual(result, { succeeded: ["m1", "m3"], failed: ["m2"] });
  assert.deepEqual(box.labels.get("m2"), ["INBOX", "UNREAD"], "the failure really was not changed");
});

test("a permission failure stops the action instead of counting failures", async () => {
  const box = fakeOrganiser({ permission: true });
  await assert.rejects(applyBatch(box.organiser, { action: "archive", labelId: null }, ["m1", "m2"]));
  assert.equal(box.calls.length, 1, "no per-message retries against a missing permission");
});

test("rows come from metadata and the snippet only, decoded for reading", () => {
  const dto = toMessageDto(
    {
      id: "18c2a",
      threadId: "t1",
      labelIds: ["INBOX", "UNREAD", "Label_1", "CATEGORY_UPDATES"],
      snippet: "Here&#39;s the &quot;plan&quot; &amp; more",
      sizeEstimate: 2048,
      date: new Date("2026-09-30T10:00:00Z"),
      headers: {
        from: '"Maya Chen" <Maya@Example.org>',
        to: "Sam <sam@example.com>, Alex <alex@example.net>",
        subject: "Saturday plans?",
        "content-type": 'multipart/mixed; boundary="x"',
      },
    },
    { labels: new Map([["Label_1", "Family"]]), accountEmail: "sam@example.com", provider: "gmail", attachmentsKnown: false },
  );
  assert.equal(dto.fromName, "Maya Chen");
  assert.equal(dto.fromAddress, "maya@example.org");
  assert.equal(dto.to, "Sam, Alex");
  assert.equal(dto.snippet, `Here's the "plan" & more`);
  assert.equal(dto.unread, true);
  assert.equal(dto.inInbox, true);
  assert.equal(dto.hasAttachment, true, "multipart/mixed carries attachments");
  assert.deepEqual(dto.labels, [{ id: "Label_1", name: "Family" }], "system labels are not shown as labels");
  assert.match(dto.gmailUrl!, /^https:\/\/mail\.google\.com\/mail\/\?authuser=/);
});

// --- The demo ----------------------------------------------------------------------------

async function demoList(params = ""): Promise<ListResponse> {
  return demoClient.get<ListResponse>(`/api/clear-out/messages?scope=all&pageSize=20${params ? `&${params}` : ""}`);
}

async function demoRun(action: string, ids: string[], extra: Record<string, unknown> = {}) {
  const run = await demoClient.post<RunDto>("/api/clear-out/runs", { action, requested: ids.length, ...extra });
  return demoClient.post<ChunkResponse>(`/api/clear-out/runs/${run.id}`, { ids });
}

test("the demo mailbox has every kind of mail, newest first, with real paging", async () => {
  const first = await demoList();
  assert.equal(first.messages.length, 20);
  assert.equal(first.totalExact, true, "the demo knows its exact total");
  assert.ok(first.total > 150);
  const dates = first.messages.map((m) => m.receivedAt!);
  assert.deepEqual([...dates].sort().reverse(), dates, "newest first");

  const second = await demoList(`pageToken=${first.nextPageToken}`);
  assert.equal(second.messages.length, 20);
  assert.ok(!second.messages.some((m) => first.messages.some((n) => n.id === m.id)), "pages do not overlap");

  const all = store.loadState().mailbox;
  assert.ok(all.some((m) => m.labelIds.includes("SENT")), "sent mail");
  assert.ok(all.some((m) => !m.labelIds.includes("INBOX") && !m.labelIds.includes("SENT")), "archived mail");
  assert.ok(all.some((m) => m.labelIds.includes("UNREAD")), "unread");
  assert.ok(all.some((m) => m.hasAttachment), "attachments");
  assert.ok(all.some((m) => m.labelIds.includes("Label_work")), "labels");
  for (const m of all) assert.match(m.fromAddress.split("@")[1], /(^|\.)example\.(com|org|net)$/);
  assert.equal(fetchCalls, 0);
});

test("demo filters combine with AND and the count is exact", async () => {
  const filtered = await demoList(`before=${Date.now() - 180 * 86_400_000}&attachments=1`);
  assert.ok(filtered.total > 0);
  for (const m of filtered.messages) {
    assert.equal(m.hasAttachment, true);
    assert.ok(Date.parse(m.receivedAt!) < Date.now() - 180 * 86_400_000);
  }
  const unreadInbox = await demoList("unread=1&scope=inbox");
  for (const m of unreadInbox.messages) {
    assert.ok(m.unread && m.inInbox);
  }
});

test("select all matching resolves exactly the matching ids, a page at a time", async () => {
  const query = f.toQuery(f.EMPTY_FILTER);
  const ids: string[] = [];
  let token: string | null = null;
  let pages = 0;
  do {
    const page: ResolveResponse = await demoClient.post<ResolveResponse>("/api/clear-out/resolve", { query, pageToken: token });
    ids.push(...page.ids);
    token = page.nextPageToken;
    pages += 1;
  } while (token);
  const expected = store.loadState().mailbox.filter((m) => !m.labelIds.includes("TRASH"));
  assert.equal(ids.length, expected.length, "every matching email, not just one page");
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(pages > 1, "gathered over several pages");
  assert.ok(ids.length > (await demoList()).messages.length, "more than the page on screen");
});

test("a demo action changes only the chosen message, not its conversation", async () => {
  const thread = () => store.loadState().mailbox.filter((m) => m.threadId === "t-alex");
  const before = thread().map((m) => [m.id, [...m.labelIds]]);
  const result = await demoRun("archive", ["m-alex-3"]);
  assert.deepEqual(result.succeeded, ["m-alex-3"]);
  for (const message of thread()) {
    const was = before.find(([id]) => id === message.id)![1] as string[];
    if (message.id === "m-alex-3") assert.ok(!message.labelIds.includes("INBOX"));
    else assert.deepEqual(message.labelIds, was, `${message.id} is untouched`);
  }
});

test("demo partial failures are reported, kept for retry, and the retry is counted once", async () => {
  const result = await demoRun("trash", ["m-old-photos", "m-landlord"]);
  assert.deepEqual(result.succeeded, ["m-landlord"]);
  assert.deepEqual(result.failed, ["m-old-photos"]);
  assert.equal(result.run.succeeded, 1);
  assert.equal(result.run.failed, 1);

  const retried = await demoClient.post<ChunkResponse>(`/api/clear-out/runs/${result.run.id}`, {
    ids: ["m-old-photos"],
    retry: true,
  });
  assert.deepEqual(retried.succeeded, ["m-old-photos"]);
  assert.equal(retried.run.succeeded, 2);
  assert.equal(retried.run.failed, 0, "moved from failed to done, not double counted");

  const history = await demoClient.get<RunDto[]>("/api/clear-out/runs");
  assert.equal(history.length, 1);
  assert.equal(history[0].action, "trash");
  const trashed = (await demoList()).messages.map((m) => m.id);
  assert.ok(!trashed.includes("m-landlord"), "Trash is outside every scope");
});

test("demo actions never touch Cleanup decisions", async () => {
  const statuses = () => store.loadState().senders.map((s) => `${s.id}:${s.status}`).join(",");
  const before = statuses();
  const unsubscribed = await demoList("unsubscribed=1");
  assert.ok(unsubscribed.total > 0, "the demo has mail from lists already left");
  await demoRun("archive", unsubscribed.messages.slice(0, 3).map((m) => m.id));
  await demoRun("label", [unsubscribed.messages[0].id], { labelId: "Label_newsletters" });
  assert.equal(statuses(), before);
  assert.equal(
    unsubscribed.messages.some((m) => m.fromAddress === "orders@verdantgrocery.example.com"),
    false,
    "another address at the same company is not the unsubscribed list",
  );
});

test("demo changes persist in this browser and Reset demo clears them", async () => {
  await demoRun("mark_read", ["m-maya-1"]);
  assert.ok(visitor.map.get("tidely.demo.v1")!.includes('"clearOutRuns":[{'), "saved locally");
  const persisted = store.loadState().mailbox.find((m) => m.id === "m-maya-1")!;
  assert.ok(!persisted.labelIds.includes("UNREAD"));

  store.clearState();
  const fresh = store.loadState();
  assert.ok(fresh.mailbox.find((m) => m.id === "m-maya-1")!.labelIds.includes("UNREAD"), "back to how it started");
  assert.deepEqual(fresh.clearOutRuns, [], "History starts empty, with nothing invented");
});

test("the demo refuses labels that aren't the person's own and oversized batches", async () => {
  await assert.rejects(demoClient.post("/api/clear-out/runs", { action: "label", requested: 1, labelId: "TRASH" }));
  const run = await demoClient.post<RunDto>("/api/clear-out/runs", { action: "trash", requested: 60 });
  const ids = store.loadState().mailbox.slice(0, 60).map((m) => m.id);
  await assert.rejects(demoClient.post(`/api/clear-out/runs/${run.id}`, { ids }), "trash batches are capped");
  assert.equal(fetchCalls, 0);
});

// --- Helpers ------------------------------------------------------------------------------

function message(overrides: Partial<import("../src/lib/clearout/filters").MatchableMessage> = {}) {
  return {
    fromAddress: "someone@example.com",
    fromName: "Someone",
    to: "Sam",
    subject: "Hello",
    snippet: "",
    receivedAt: Date.now(),
    unread: false,
    hasAttachment: false,
    sizeBytes: 1000,
    labelIds: ["INBOX"],
    listId: null,
    ...overrides,
  };
}
