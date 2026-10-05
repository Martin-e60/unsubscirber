import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiRequestError, api, type ApiClient, type RequestOptions } from "../src/lib/api/client";
import { MAILBOX_SWITCHED, createMailboxClient } from "../src/lib/api/scoped";
import { MAILBOX_HEADER, MAILBOX_NOT_FOUND, MAILBOX_SPECIFIC_PARAMS } from "../src/lib/mailbox/shared";

/**
 * Switching mailboxes in the browser: every request is bound to the mailbox
 * it was made for, and once a tab switches away, nothing from the old
 * mailbox — a late answer, the next step of a loop — reaches the screen or
 * the server.
 */

type Call = { method: string; path: string; options: RequestOptions | undefined };

/** A stand-in API whose answers the test releases by hand. */
function controllableBase() {
  const calls: Call[] = [];
  const pending: Array<() => void> = [];
  const answer = (method: string) => (path: string, ...rest: unknown[]) => {
    const options = rest.at(-1) as RequestOptions | undefined;
    calls.push({ method, path, options });
    return new Promise((resolve) => pending.push(() => resolve({ path, mailboxId: options?.mailboxId })));
  };
  const base = {
    get: answer("GET"),
    post: answer("POST"),
    patch: answer("PATCH"),
    del: answer("DELETE"),
  } as unknown as ApiClient;
  return { base, calls, release: () => pending.splice(0).forEach((resolve) => resolve()) };
}

test("every request from a scoped client names its mailbox", async () => {
  const { base, calls, release } = controllableBase();
  const client = createMailboxClient(base, "mailbox-a", { signal: new AbortController().signal });
  const results = Promise.all([
    client.get("/api/senders"),
    client.post("/api/unsubscribe", { senderId: "s1" }),
    client.patch("/api/senders/s1", { status: "KEPT" }),
    client.del("/api/something"),
  ]);
  release();
  await results;
  assert.deepEqual(calls.map((call) => call.options?.mailboxId), ["mailbox-a", "mailbox-a", "mailbox-a", "mailbox-a"]);
});

test("after a switch, a late answer for the old mailbox is dropped and nothing new is sent", async () => {
  const { base, calls, release } = controllableBase();
  const controller = new AbortController();
  const old = createMailboxClient(base, "mailbox-a", { signal: controller.signal });

  const inFlight = old.get("/api/senders");
  controller.abort(); // the tab switched to another mailbox
  release(); // …and only then did the answer arrive

  await assert.rejects(inFlight, (error: ApiRequestError) => error.code === MAILBOX_SWITCHED);

  // A loop still holding the old client — a scan step, an unsubscribe batch —
  // is stopped before anything leaves the browser.
  const before = calls.length;
  await assert.rejects(old.post("/api/scan/step", { scanId: "x" }), (error: ApiRequestError) => error.code === MAILBOX_SWITCHED);
  assert.equal(calls.length, before, "no request was made");

  // The new mailbox's client is unaffected.
  const fresh = createMailboxClient(base, "mailbox-b", { signal: new AbortController().signal });
  const answer = fresh.get<{ mailboxId: string }>("/api/senders");
  release();
  assert.equal((await answer).mailboxId, "mailbox-b");
});

test("a mailbox removed elsewhere is reported so the tab can move on", async () => {
  let gone = 0;
  const base = {
    get: async () => {
      throw new ApiRequestError("That mailbox is no longer connected to your account.", 404, MAILBOX_NOT_FOUND);
    },
  } as unknown as ApiClient;
  const client = createMailboxClient(base, "removed", {
    signal: new AbortController().signal,
    onMailboxGone: () => void (gone += 1),
  });
  await assert.rejects(client.get("/api/stats"), { status: 404 });
  assert.equal(gone, 1);
});

test("the real client sends the mailbox header and reads error codes", async (t) => {
  const seen: Headers[] = [];
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    seen.push(new Headers(init?.headers));
    return new Response(JSON.stringify({ error: "That mailbox is no longer connected to your account.", code: MAILBOX_NOT_FOUND }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });
  await assert.rejects(api.get("/api/stats", { mailboxId: "m-42" }), (error: ApiRequestError) => {
    assert.equal(error.status, 404);
    assert.equal(error.code, MAILBOX_NOT_FOUND);
    return true;
  });
  assert.equal(seen[0].get(MAILBOX_HEADER), "m-42");

  await assert.rejects(api.get("/api/me"));
  assert.equal(seen[1].get(MAILBOX_HEADER), null, "no mailbox, no header");
});

test("switching drops only the URL parameters that point inside one mailbox", () => {
  assert.deepEqual([...MAILBOX_SPECIFIC_PARAMS].sort(), ["access", "review", "senderId"]);
});
