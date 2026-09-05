import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decodeMimeWords,
  findUnsubscribeLinkInBody,
  parseFromHeader,
  parseUnsubscribeHeaders,
} from "../src/lib/mail/headers";
import { pageConfirmsUnsubscribe } from "../src/lib/unsubscribe/confirmation";
import { isPrivateAddress } from "../src/lib/unsubscribe/ip";

/**
 * Tests for the pure logic that decides what a subscription is and how to
 * leave it. These are the parts where a mistake is silent and expensive — a
 * mis-parsed header means a sender you can never unsubscribe from.
 *
 * Run with: npm test
 */

test("parseFromHeader handles the shapes real mail uses", () => {
  assert.deepEqual(parseFromHeader("Figma <news@figma.com>"), {
    address: "news@figma.com",
    name: "Figma",
  });

  assert.deepEqual(parseFromHeader('"Figma, Inc." <News@Figma.com>'), {
    address: "news@figma.com",
    name: "Figma, Inc.",
  });

  assert.deepEqual(parseFromHeader("news@figma.com"), {
    address: "news@figma.com",
    name: null,
  });

  assert.deepEqual(parseFromHeader(null), { address: "", name: null });
  assert.equal(parseFromHeader("not an address").address, "");
});

test("decodeMimeWords decodes base64 and quoted-printable names", () => {
  assert.equal(decodeMimeWords("=?UTF-8?B?RmlnbWEgTmV3cw==?="), "Figma News");
  assert.equal(decodeMimeWords("=?ISO-8859-1?Q?caf=E9?="), "café");
  assert.equal(decodeMimeWords("=?UTF-8?Q?Hello_World?="), "Hello World");
  assert.equal(decodeMimeWords("Plain Name"), "Plain Name");
});

test("parseFromHeader decodes encoded display names", () => {
  const parsed = parseFromHeader("=?UTF-8?B?RmlnbWEgTmV3cw==?= <news@figma.com>");
  assert.equal(parsed.name, "Figma News");
  assert.equal(parsed.address, "news@figma.com");
});

test("parseUnsubscribeHeaders finds both http and mailto targets", () => {
  const parsed = parseUnsubscribeHeaders(
    "<https://x.com/u?id=9>, <mailto:un@x.com?subject=stop>",
    null,
  );
  assert.equal(parsed.http, "https://x.com/u?id=9");
  assert.equal(parsed.mailto, "un@x.com");
  assert.equal(parsed.mailtoSubject, "stop");
  assert.equal(parsed.oneClick, false);
});

test("one-click is only claimed for https targets", () => {
  const https = parseUnsubscribeHeaders(
    "<https://x.com/u?id=9>",
    "List-Unsubscribe=One-Click",
  );
  assert.equal(https.oneClick, true);

  // Header present but the only target is a mailto: not one-click.
  const mailtoOnly = parseUnsubscribeHeaders(
    "<mailto:un@x.com>",
    "List-Unsubscribe=One-Click",
  );
  assert.equal(mailtoOnly.oneClick, false);

  // RFC 8058 requires https, so plain http must not count.
  const insecure = parseUnsubscribeHeaders(
    "<http://x.com/u>",
    "List-Unsubscribe=One-Click",
  );
  assert.equal(insecure.oneClick, false);
});

test("parseUnsubscribeHeaders survives malformed input", () => {
  assert.equal(parseUnsubscribeHeaders(null, null).http, null);
  assert.equal(parseUnsubscribeHeaders("", null).http, null);
  // Missing angle brackets — some senders really do this.
  assert.equal(
    parseUnsubscribeHeaders("https://x.com/u, mailto:un@x.com", null).mailto,
    "un@x.com",
  );
  // A broken URL must not throw or poison the mailto result.
  const mixed = parseUnsubscribeHeaders("<http://[bad>, <mailto:un@x.com>", null);
  assert.equal(mixed.mailto, "un@x.com");
});

test("findUnsubscribeLinkInBody picks the unsubscribe link, not the others", () => {
  const html = `
    <a href="https://shop.example.com/sale">Shop the sale</a>
    <a href="https://example.com/privacy">Privacy policy</a>
    <a href="https://example.com/u/abc123">Unsubscribe</a>
  `;
  assert.equal(findUnsubscribeLinkInBody(html), "https://example.com/u/abc123");
});

test("findUnsubscribeLinkInBody reads the href when the text is unhelpful", () => {
  const html = `<a href="https://example.com/optout?id=5"><img src="x.png"/>click</a>`;
  assert.equal(findUnsubscribeLinkInBody(html), "https://example.com/optout?id=5");
});

test("findUnsubscribeLinkInBody returns null when nothing matches", () => {
  assert.equal(findUnsubscribeLinkInBody("<a href='https://x.com'>Home</a>"), null);
  assert.equal(findUnsubscribeLinkInBody(""), null);
});

test("pageConfirmsUnsubscribe only trusts an actual confirmation", () => {
  assert.equal(
    pageConfirmsUnsubscribe("<p>You have been unsubscribed from our list.</p>"),
    true,
  );
  assert.equal(
    pageConfirmsUnsubscribe("<h1>You will no longer receive these emails</h1>"),
    true,
  );

  // A form asking you to confirm is not a confirmation.
  assert.equal(
    pageConfirmsUnsubscribe("<p>Click here to confirm you want to unsubscribe</p>"),
    false,
  );
  assert.equal(pageConfirmsUnsubscribe("<p>Unsubscribe</p>"), false);
  assert.equal(pageConfirmsUnsubscribe(""), false);
});

test("isPrivateAddress blocks internal networks and cloud metadata", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.5",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.255",
    "169.254.169.254", // cloud metadata endpoint
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ]) {
    assert.equal(isPrivateAddress(address), true, `${address} should be private`);
  }

  for (const address of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700::1111"]) {
    assert.equal(isPrivateAddress(address), false, `${address} should be public`);
  }
});
