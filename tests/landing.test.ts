import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * The landing page's behaviour and constraints that are not visual.
 *
 * The visual design is checked in a real browser; these pin down the parts a
 * refactor could quietly break: the accordion rule, the approved palette, and
 * that the landing styles cannot leak into the rest of the app.
 */

test("the outcomes accordion keeps at most one row open", async () => {
  const { nextOpen } = await import("../src/components/landing/accordion");

  // The first row starts open; opening another closes it.
  assert.equal(nextOpen(0, 2), 2);
  // Opening a row from nothing open.
  assert.equal(nextOpen(null, 1), 1);
  // Clicking the open row closes it.
  assert.equal(nextOpen(2, 2), null);
});

test("the landing tokens are exactly the approved HEX values", () => {
  const css = fs.readFileSync(
    path.join("src", "components", "landing", "theme.module.css"),
    "utf8",
  );

  const approved: Record<string, string> = {
    "--lp-bg": "#FBF4EF",
    "--lp-text": "#35232B",
    "--lp-text-2": "#795C65",
    "--lp-accent": "#A32D4D",
    "--lp-soft": "#F5D8DE",
    "--lp-line": "#E8D6D9",
    "--lp-panel": "#FFFEFC",
    "--lp-on-accent": "#FFFFFF",
  };

  for (const [token, hex] of Object.entries(approved)) {
    const match = new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})\\s*;`).exec(css);
    assert.ok(match, `${token} is defined`);
    assert.equal(match[1].toUpperCase(), hex, `${token} is ${hex}`);
  }
});

test("landing styles are scoped: no global selectors except the page's own body", () => {
  const dir = path.join("src", "components", "landing");
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".css"))
    .map((file) => path.join(dir, file))
    .concat(path.join("src", "app", "page.module.css"));

  for (const file of files) {
    const css = fs.readFileSync(file, "utf8");
    const globals = css.match(/:global\([^)]*\)[^{]*/g) ?? [];
    for (const selector of globals) {
      // The one allowed exception paints the body only when it contains the
      // landing page's own themed root, in either of its two themes.
      assert.match(
        selector.trim(),
        /^:global\(body\):has\(\.theme(\[data-theme="dark"\])?\)$/,
        `${file} must not style other pages: ${selector.trim()}`,
      );
    }
  }
});

test("the landing page no longer links to the removed free page", () => {
  const page = fs.readFileSync(path.join("src", "app", "page.tsx"), "utf8");
  const components = fs
    .readdirSync(path.join("src", "components", "landing"))
    .filter((file) => file.endsWith(".tsx"))
    .map((file) =>
      fs.readFileSync(path.join("src", "components", "landing", file), "utf8"),
    );

  for (const source of [page, ...components]) {
    assert.ok(!source.includes('"/free"'), "no link to /free");
  }
});
