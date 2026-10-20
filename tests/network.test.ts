import { test } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { GmailApiError, GmailProvider } from "../src/lib/mail/gmail";
import { assertPublicUrl, safeFetch } from "../src/lib/unsubscribe/safe-fetch";

const publicUrl = "https://93.184.216.34/unsubscribe";
const gmail = () => new GmailProvider("reader@example.com", "test-token");
const scanOptions = { lookbackDays: 30, pageSize: 10 };

test("a message deleted after listing is skipped, but an auth failure stops the scan", async (t) => {
  let status = 404;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.ok(init?.signal instanceof AbortSignal, "Gmail calls have a deadline");
    return String(input).includes("/messages?")
      ? Response.json({ messages: [{ id: "a1" }] })
      : Response.json({ error: "unavailable" }, { status });
  });

  assert.deepEqual((await gmail().listSubscriptionMessages(scanOptions)).messages, []);
  status = 401;
  await assert.rejects(gmail().listSubscriptionMessages(scanOptions), GmailApiError);
});

test("a metadata network failure cannot be reported as a completed empty scan", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    if (String(input).includes("/messages?")) return Response.json({ messages: [{ id: "a1" }] });
    throw new TypeError("connection lost");
  });
  await assert.rejects(gmail().listSubscriptionMessages(scanOptions), /connection lost/);
});

test("Clear out skips missing messages and surfaces other metadata failures", async (t) => {
  let status = 404;
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "denied" }, { status }));
  assert.deepEqual(await gmail().getMetadata(["a1"], ["From"]), [null]);
  status = 403;
  await assert.rejects(gmail().getMetadata(["a1"], ["From"]), GmailApiError);
});

test("sending an email is attempted once even when Gmail returns a transient error", async (t) => {
  const send = t.mock.method(globalThis, "fetch", async () => new Response("Try again", { status: 503 }));
  await assert.rejects(gmail().sendMail({ to: "leave@example.com", subject: "unsubscribe", body: "Leave" }), GmailApiError);
  assert.equal(send.mock.callCount(), 1, "retrying an accepted send could email the sender twice");
});

test("a read retries a transient Gmail error and keeps its authentication", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-token");
    return ++calls === 1 ? new Response("Busy", { status: 429 }) : Response.json({ labels: [] });
  });
  assert.deepEqual(await gmail().listLabels(), []);
  assert.equal(calls, 2);
});

test("multipart mail prefers HTML even when a nested plain-text alternative comes first", async (t) => {
  const html = '<a href="https://example.com/leave">Unsubscribe</a>';
  t.mock.method(globalThis, "fetch", async () => Response.json({ payload: {
    mimeType: "multipart/mixed",
    parts: [
      { mimeType: "multipart/alternative", parts: [
        { mimeType: "text/plain", body: { data: Buffer.from("Plain version").toString("base64url") } },
      ] },
      { mimeType: "text/html", body: { data: Buffer.from(html).toString("base64url") } },
    ],
  } }));
  assert.equal(await gmail().getMessageHtml("a1"), html);
});

test("a plain-text body remains available when mail has no HTML alternative", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ payload: {
    mimeType: "text/plain", body: { data: Buffer.from("Plain version").toString("base64url") },
  } }));
  assert.equal(await gmail().getMessageHtml("a1"), "Plain version");
});

test("body lookup returns null only for missing mail, and propagates permission failures", async (t) => {
  let status = 404;
  t.mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status }));
  assert.equal(await gmail().getMessageHtml("a1"), null);
  status = 401;
  await assert.rejects(gmail().getMessageHtml("a1"), GmailApiError);
});

test("manual redirect handling never turns a one-click POST into a successful GET", async (t) => {
  const send = t.mock.method(globalThis, "fetch", async () => new Response("", {
    status: 302, headers: { Location: "/generic-success" },
  }));
  const result = await safeFetch(publicUrl, { method: "POST", body: "List-Unsubscribe=One-Click", redirect: "manual" });
  assert.equal(result.status, 302);
  assert.equal(result.finalUrl, publicUrl);
  assert.equal(send.mock.callCount(), 1);
});

test("a 307 preserves the POST body, while a 302 changes it to a GET", async (t) => {
  let redirectStatus = 307;
  const calls: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init: RequestInit) => {
    calls.push(init);
    return calls.length % 2 === 1
      ? new Response("", { status: redirectStatus, headers: { Location: "/destination" } })
      : new Response("Done");
  });
  const init = { method: "POST", body: "form=value", headers: new Headers({ "Content-Type": "application/x-www-form-urlencoded" }) };
  await safeFetch(publicUrl, init);
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[1].body, "form=value");
  redirectStatus = 302;
  await safeFetch(publicUrl, init);
  assert.equal(calls[3].method, "GET");
  assert.equal(calls[3].body, undefined);
  assert.equal(new Headers(calls[3].headers).has("Content-Type"), false);
});

test("redirects release response bodies and do not forward credentials to another origin", async (t) => {
  let cancelled = false;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init: RequestInit) => {
    if (++calls === 1) return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      status: 302, headers: { Location: "https://1.1.1.1/finish" },
    });
    const headers = new Headers(init.headers);
    assert.equal(headers.has("Authorization"), false);
    assert.equal(headers.has("Cookie"), false);
    return new Response("Done");
  });
  await safeFetch(publicUrl, { headers: { Authorization: "test", Cookie: "test" } });
  assert.equal(cancelled, true);
});

test("each redirect target is checked before another network request is sent", async (t) => {
  const send = t.mock.method(globalThis, "fetch", async () => new Response("", {
    status: 302, headers: { Location: "http://127.0.0.1/private" },
  }));
  await assert.rejects(safeFetch(publicUrl), /private network/);
  assert.equal(send.mock.callCount(), 1);
});

test("redirect loops fail after the limit and release every response", async (t) => {
  let cancelled = 0;
  const send = t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    cancel() { cancelled++; },
  }), { status: 302, headers: { Location: "/again" } }));
  await assert.rejects(safeFetch(publicUrl), /Too many redirects/);
  assert.equal(send.mock.callCount(), 4);
  assert.equal(cancelled, 4);
});

test("the response cap is measured in bytes and cancels oversized streams", async (t) => {
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(Buffer.from("é".repeat(300_000))); },
    cancel() { cancelled = true; },
  })));
  const result = await safeFetch(publicUrl);
  assert.equal(result.body, "é".repeat(128 * 1024));
  assert.equal(cancelled, true);
});

test("an already cancelled request sends nothing", async (t) => {
  const send = t.mock.method(globalThis, "fetch", async () => new Response("Unexpected"));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(safeFetch(publicUrl, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(send.mock.callCount(), 0);
});

test("cancelling also stops waiting for an unresolved hostname", async (t) => {
  t.mock.method(dns, "lookup", () => new Promise(() => {}));
  const send = t.mock.method(globalThis, "fetch", async () => new Response("Unexpected"));
  const controller = new AbortController();
  const pending = safeFetch("https://slow-dns.example/unsubscribe", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(send.mock.callCount(), 0);
});

test("URLs with credentials or internal IPv6 representations are refused", async () => {
  for (const url of [
    "https://user:password@93.184.216.34/",
    "http://[::ffff:7f00:1]/",
    "http://[0:0:0:0:0:0:0:1]/",
    "http://[fea0::1]/",
  ]) await assert.rejects(assertPublicUrl(url));
});
