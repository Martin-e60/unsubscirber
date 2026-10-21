import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Old links must keep working.
 *
 * /pricing was a real, linkable page. Removing pricing is the point of the
 * rework, but breaking the URL would be a side effect nobody asked for, so it
 * permanently redirects to the landing page.
 */

test("/pricing permanently redirects to the landing page", async () => {
  const { default: PricingPage } = await import("../src/app/pricing/page");

  const error = await (async () => {
    try {
      PricingPage();
      return null;
    } catch (thrown) {
      return thrown;
    }
  })();

  assert.ok(error, "the page redirects rather than rendering");
  const digest = String((error as { digest?: string }).digest ?? "");
  assert.match(digest, /^NEXT_REDIRECT/, "and it is a Next redirect");
  // The digest is "NEXT_REDIRECT;<type>;<url>;<status>;" — check the url field.
  assert.equal(digest.split(";")[2], "/", "to the landing page");
  assert.match(digest, /308/, "as a permanent redirect");
});

test("the first scan looks back a month, not a year", async () => {
  const { DEFAULT_LOOKBACK_DAYS, LOOKBACK_OPTIONS } = await import("../src/lib/constants");

  assert.equal(DEFAULT_LOOKBACK_DAYS, 30);
  assert.ok(
    (LOOKBACK_OPTIONS as readonly number[]).includes(DEFAULT_LOOKBACK_DAYS),
    "and the default is one of the options the UI offers",
  );
});

test("the signed-in navigation offers no pricing, rollups, senders or Clear out page", async () => {
  const { NAV, DEMO_NAV } = await import("../src/lib/navigation");

  const paths = NAV.map((item) => item.href);
  assert.ok(!paths.includes("/pricing"));
  assert.ok(!paths.includes("/rollups"));
  assert.ok(!paths.includes("/clear-out"), "Clear out is part of Cleanup now");
  assert.deepEqual(paths, ["/dashboard", "/cleanup", "/unsubscribed", "/settings"]);
  assert.ok(!DEMO_NAV.some((item) => item.href === "/clear-out"), "nor does the demo");
  assert.ok(!DEMO_NAV.some((item) => item.href === "/senders"), "nor does the demo");

  // The demo has no mailbox to configure.
  assert.ok(!DEMO_NAV.some((item) => item.href === "/settings"));
});

test("no public feature page advertises something that was never built", async () => {
  const { FEATURES } = await import("../src/lib/features");

  const slugs: string[] = FEATURES.map((feature) => feature.slug);
  assert.ok(!slugs.includes("rollups"), "rollups is not advertised");

  for (const feature of FEATURES) {
    const text = [feature.description, ...feature.details].join(" ").toLowerCase();
    for (const phrase of ["coming soon", "unlimited", "upgrade", "free trial"]) {
      assert.ok(!text.includes(phrase), `"${phrase}" must not appear in ${feature.slug}`);
    }
  }
});

/** Runs an async page and returns the URL it redirected to. */
async function redirectOf(render: () => Promise<unknown>): Promise<string> {
  try {
    await render();
  } catch (thrown) {
    const digest = String((thrown as { digest?: string }).digest ?? "");
    assert.match(digest, /^NEXT_REDIRECT/);
    return digest.split(";")[2];
  }
  throw new Error("the page rendered instead of redirecting");
}

test("old Senders links land in Cleanup, keeping their context", async () => {
  const { sendersRedirect } = await import("../src/lib/navigation");

  assert.equal(sendersRedirect("", {}), "/cleanup?view=keeping");
  assert.equal(sendersRedirect("", { status: "ALL" }), "/cleanup?view=keeping");
  assert.equal(sendersRedirect("", { status: "KEPT" }), "/cleanup?view=keeping");
  assert.equal(sendersRedirect("", { search: "figma" }), "/cleanup?view=keeping&search=figma");
  assert.equal(sendersRedirect("", { status: "MANUAL" }), "/cleanup?status=MANUAL");
  assert.equal(sendersRedirect("", { status: "FAILED" }), "/cleanup?status=FAILED");
  assert.equal(sendersRedirect("", { status: "REQUESTED" }), "/cleanup?status=REQUESTED");
  assert.equal(sendersRedirect("", { status: "ACTIVE" }), "/cleanup");
  assert.equal(sendersRedirect("", { status: "UNSUBSCRIBED" }), "/unsubscribed");
  assert.equal(sendersRedirect("/demo", {}), "/demo/cleanup?view=keeping");
  assert.equal(sendersRedirect("/demo", { status: "MANUAL" }), "/demo/cleanup?status=MANUAL");
});

test("the Senders pages redirect, in the app and the demo", async () => {
  const { default: SendersPage } = await import("../src/app/senders/page");
  const { default: DemoSendersPage } = await import("../src/app/demo/senders/page");

  assert.equal(
    await redirectOf(() => SendersPage({ searchParams: Promise.resolve({}) })),
    "/cleanup?view=keeping",
  );
  assert.equal(
    await redirectOf(() => DemoSendersPage({ searchParams: Promise.resolve({ status: "FAILED" }) })),
    "/demo/cleanup?status=FAILED",
  );
});

test("Cleanup's view is read from the URL, defaulting to To review", async () => {
  const { cleanupView, cleanupHref, unconfirmedStatus } = await import("../src/lib/navigation");

  assert.equal(cleanupView(null), "review");
  assert.equal(cleanupView("anything"), "review");
  assert.equal(cleanupView("keeping"), "keeping");
  assert.equal(unconfirmedStatus("ACTIVE"), null, "the default list is not a follow-up filter");
  assert.equal(cleanupHref("", { view: "review" }), "/cleanup");
  assert.equal(cleanupHref("/demo", { view: "keeping", status: "MANUAL" }), "/demo/cleanup?view=keeping");
});

test("Home and Cleanup share the header layout; every other page keeps the sidebar", async () => {
  const { usesHomeShell } = await import("../src/lib/navigation");

  assert.equal(usesHomeShell("/dashboard"), true);
  assert.equal(usesHomeShell("/cleanup"), true);
  assert.equal(usesHomeShell("/demo", "/demo"), true);
  assert.equal(usesHomeShell("/demo/cleanup", "/demo"), true);
  for (const path of ["/unsubscribed", "/settings", "/history", "/rollups", "/connect"]) {
    assert.equal(usesHomeShell(path), false, path);
  }
  assert.equal(usesHomeShell("/cleanup", "/demo"), false, "the real app's path is not the demo's");
});

test("Cleanup links carry the message filters, the all-emails mode and a review", async () => {
  const { cleanupHref } = await import("../src/lib/navigation");
  const { EMPTY_FILTER } = await import("../src/lib/clearout/filters");

  assert.equal(cleanupHref("", { all: true }), "/cleanup?mail=all");
  assert.equal(cleanupHref("", { review: "s1" }), "/cleanup?review=s1");
  assert.equal(
    cleanupHref("/demo", { view: "keeping", filter: { ...EMPTY_FILTER, unread: true, older: "6m" } }),
    "/demo/cleanup?view=keeping&older=6m&unread=1",
  );
  assert.equal(
    cleanupHref("", { status: "MANUAL", all: true, filter: { ...EMPTY_FILTER, scope: { kind: "inbox" } } }),
    "/cleanup?status=MANUAL&mail=all&scope=inbox",
  );
  assert.equal(cleanupHref("", { filter: EMPTY_FILTER }), "/cleanup", "defaults add nothing");
});

test("old Clear out links land in the unified workspace with their filters", async () => {
  const { clearOutRedirect } = await import("../src/lib/navigation");

  // Clear out showed the whole mailbox: with no single sender, so does Cleanup.
  assert.equal(clearOutRedirect("", {}), "/cleanup?mail=all");
  assert.equal(
    clearOutRedirect("", { unread: "1", older: "6m", q: "invoice" }),
    "/cleanup?unread=1&older=6m&q=invoice&mail=all",
  );
  assert.equal(
    clearOutRedirect("/demo", { scope: "inbox", attachments: "1" }),
    "/demo/cleanup?scope=inbox&attachments=1&mail=all",
  );

  // One sender: Cleanup opens that sender if it knows them, so no all-emails mode is forced.
  assert.equal(
    clearOutRedirect("", { from: "news@example.com", unread: "1" }),
    "/cleanup?from=news%40example.com&unread=1",
  );
  // Several senders are a mailbox-wide filter.
  assert.equal(
    clearOutRedirect("", { from: ["a@example.com", "b@example.com"] }),
    "/cleanup?from=a%40example.com&from=b%40example.com&mail=all",
  );

  // The way back from Google's permission screen keeps its outcome and mailbox.
  assert.equal(
    clearOutRedirect("", { access: "granted", mailbox: "box-1" }),
    "/cleanup?access=granted&mailbox=box-1&mail=all",
  );

  // Cleanup's own parameters are never taken from an old link.
  assert.equal(clearOutRedirect("", { view: "keeping", status: "FAILED", review: "x", mail: "none" }), "/cleanup?mail=all");
});

test("the Clear out pages redirect, in the app and the demo", async () => {
  const { default: ClearOutPage } = await import("../src/app/clear-out/page");
  const { default: DemoClearOutPage } = await import("../src/app/demo/clear-out/page");

  assert.equal(await redirectOf(() => ClearOutPage({ searchParams: Promise.resolve({}) })), "/cleanup?mail=all");
  assert.equal(
    await redirectOf(() =>
      ClearOutPage({ searchParams: Promise.resolve({ from: "news@example.com", older: "3m" }) }),
    ),
    "/cleanup?from=news%40example.com&older=3m",
  );
  assert.equal(
    await redirectOf(() => DemoClearOutPage({ searchParams: Promise.resolve({ unread: "1" }) })),
    "/demo/cleanup?unread=1&mail=all",
  );
});

test("the permission trip returns to Cleanup, where organising now happens", async () => {
  const { grantUrlFor } = await import("../src/lib/clearout/server");
  const { safeNextPath } = await import("../src/lib/auth/next");

  assert.match(grantUrlFor({ id: "m-1" }), /next=%2Fcleanup$/);
  assert.equal(safeNextPath("/cleanup?access=granted"), "/cleanup?access=granted");
  // Links already out in the world still resolve.
  assert.equal(safeNextPath("/clear-out?unread=1"), "/clear-out?unread=1");
});
