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

test("the signed-in navigation offers no pricing and no rollups", async () => {
  const { NAV, DEMO_NAV } = await import("../src/lib/navigation");

  const paths = NAV.map((item) => item.href);
  assert.ok(!paths.includes("/pricing"));
  assert.ok(!paths.includes("/rollups"));
  assert.deepEqual(paths, ["/dashboard", "/cleanup", "/senders", "/unsubscribed", "/settings"]);

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
