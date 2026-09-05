import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * The development-only sign-in must not exist in production.
 *
 * That route hands out a session with no credentials at all. The single
 * NODE_ENV check inside it is the only thing between convenience and an
 * authentication bypass on a deployed instance, so it gets a test of its own.
 */

process.env.DATABASE_URL = "file::memory:";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
process.env.SESSION_SECRET = Buffer.alloc(32, 6).toString("base64");

let GET: typeof import("../src/app/api/auth/dev/route")["GET"];
let db: typeof import("../src/db")["db"];
let schema: typeof import("../src/db/schema");

/** NODE_ENV is typed as read-only, so it is written through the env object. */
function setNodeEnv(value: string): void {
  Object.assign(process.env, { NODE_ENV: value });
}

before(async () => {
  ({ db } = await import("../src/db"));
  const client = db.$client;

  for (const file of fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    const migration = fs.readFileSync(path.join("drizzle", file), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.execute(statement);
    }
  }

  ({ GET } = await import("../src/app/api/auth/dev/route"));
  schema = await import("../src/db/schema");
});

after(() => {
  db?.$client.close();
});

test("the dev sign-in is a 404 in production", async () => {
  setNodeEnv("production");

  const response = await GET();

  assert.equal(response.status, 404, "production must not expose this route");
  assert.equal(
    response.headers.get("location"),
    null,
    "it must not redirect into a signed-in session",
  );
});

test("it creates no account when refused", async () => {
  setNodeEnv("production");

  await GET();

  const users = await db.select().from(schema.users);
  assert.equal(users.length, 0, "a refused request must not touch the database");
});

test("it is available outside production", async () => {
  setNodeEnv("development");

  // The signed-in path calls next/headers cookies(), which only exists inside
  // a real request, so this asserts that it gets past the production guard —
  // it fails somewhere later rather than returning 404.
  const outcome = await GET().then(
    (response) => ({ status: response.status }),
    () => ({ status: "threw-past-the-guard" as const }),
  );

  assert.notEqual(outcome.status, 404, "development must not be refused");
});
