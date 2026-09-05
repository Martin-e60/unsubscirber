import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

process.env.DATABASE_URL = "file::memory:";
process.env.SESSION_SECRET = Buffer.alloc(32, 31).toString("base64");
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 32).toString("base64");
process.env.APP_URL = "http://localhost:3000";

let db: typeof import("../src/db")["db"];
let schema: typeof import("../src/db/schema");
let credentials: typeof import("../src/lib/auth/credentials");
let google: typeof import("../src/lib/auth/google-user");
const password = "A test-only phrase with spaces";

before(async () => {
  ({ db } = await import("../src/db"));
  schema = await import("../src/db/schema");
  credentials = await import("../src/lib/auth/credentials");
  google = await import("../src/lib/auth/google-user");
  for (const file of fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    for (const sql of fs.readFileSync(path.join("drizzle", file), "utf8").split("--> statement-breakpoint")) {
      if (sql.trim()) await db.$client.execute(sql);
    }
  }
});
after(() => db?.$client.close());

test("password signup hashes passwords and login normalizes the email", async () => {
  const id = await credentials.registerWithPassword({ name: " Alex ", email: " Alex@Example.com ", password });
  const [stored] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  assert.equal(stored.email, "alex@example.com");
  assert.equal(stored.name, "Alex");
  assert.match(stored.passwordHash!, /^scrypt\$/);
  assert.ok(!stored.passwordHash!.includes(password));
  assert.equal(await credentials.loginWithPassword({ email: "ALEX@example.com", password }), id);
  assert.equal((await db.select().from(schema.mailAccounts)).length, 0, "signup does not invent a mailbox");
});

test("duplicate signup cannot replace the existing password", async () => {
  await assert.rejects(credentials.registerWithPassword({ name: "Imposter", email: "alex@example.com", password: "another long password" }), { status: 409 });
  assert.ok(await credentials.loginWithPassword({ email: "alex@example.com", password }));
});

test("wrong password and unknown email have the same safe error", async () => {
  for (const email of ["alex@example.com", "missing@example.com"]) {
    await assert.rejects(credentials.loginWithPassword({ email, password: "wrong password" }), { status: 401, message: "Email or password is incorrect." });
  }
});

test("invalid signup data creates no user", async () => {
  for (const input of [
    { name: "Alex", email: "broken", password },
    { name: "Alex", email: "short@example.com", password: "short" },
    { name: " ", email: "empty@example.com", password },
  ]) await assert.rejects(credentials.registerWithPassword(input));
  assert.equal((await db.select().from(schema.users)).length, 1);
});

test("rate limiting persists in the database and expires", async () => {
  const now = 2_000_000_000_000;
  for (let i = 0; i < 10; i++) await credentials.limitAuthAttempts("login", "rate@example.com", now);
  await assert.rejects(credentials.limitAuthAttempts("login", "RATE@example.com", now), { status: 429 });
  await credentials.limitAuthAttempts("login", "rate@example.com", now + 15 * 60 * 1000 + 1);
});

test("cross-site credential submissions are rejected", () => {
  for (const origin of [null, "https://evil.example", "http://localhost:3000.evil.example"]) {
    assert.throws(() => credentials.requireAuthOrigin(new Request("http://localhost:3000/api/auth/login", {
      headers: origin ? { origin } : {},
    })), { status: 403 });
  }
  credentials.requireAuthOrigin(new Request("http://localhost:3000/api/auth/login", { headers: { origin: "http://localhost:3000" } }));
});

test("OAuth state is signed, audience-bound, and rejects tampering or mismatched state", async () => {
  const { createOAuthState, readOAuthState } = await import("../src/lib/auth/oauth-state");
  const cookie = await createOAuthState("random-state", "connect", "user-123");
  assert.deepEqual(await readOAuthState(cookie, "random-state"), { mode: "connect", userId: "user-123" });
  assert.equal(await readOAuthState(cookie, "other-state"), null);
  assert.equal(await readOAuthState(`tampered.${cookie}`, "random-state"), null);
  const { createSession } = await import("../src/lib/session");
  assert.equal(await readOAuthState(await createSession("user-123"), "random-state"), null);
});

test("Google never links to a password signup based only on an email match", async () => {
  const profile = { sub: "google-alex", email: "alex@example.com", email_verified: true };
  await assert.rejects(google.resolveGoogleUser(profile, null), { code: "account_exists" });
  const [local] = await db.select().from(schema.users).where(eq(schema.users.email, profile.email));
  const linked = await google.resolveGoogleUser(profile, local.id);
  assert.equal(linked.id, local.id);
  assert.equal((await google.resolveGoogleUser(profile, null)).id, local.id);
  await assert.rejects(google.resolveGoogleUser(profile, "someone-else"), { code: "account_linked" });
});

test("unverified Google identities cannot create users", async () => {
  await assert.rejects(google.resolveGoogleUser({ sub: "unverified", email: "unverified@example.com", email_verified: false }, null), { code: "failed" });
});

test("OAuth failures return safe error codes and clear the state cookie", async () => {
  const { authFailure } = await import("../src/lib/auth/redirect");
  const { authErrorMessage, authMode } = await import("../src/lib/auth-flow");
  const response = authFailure("register", "cancelled");
  assert.equal(response.headers.get("location"), "http://localhost:3000/register?error=cancelled");
  assert.match(response.headers.get("set-cookie")!, /oauth_state=;/);
  assert.equal(authMode("https://evil.example"), "login");
  assert.equal(authErrorMessage("private-error-value"), "We couldn't sign you in. Please try again.");
});

test("an invalid Google callback never exchanges a code or starts a session", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Must not call Google"); });
  const { GET } = await import("../src/app/api/auth/google/callback/route");
  const response = await GET(new NextRequest("http://localhost:3000/api/auth/google/callback?code=fake&state=fake"));
  assert.equal(response.headers.get("location"), "http://localhost:3000/login?error=expired");
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.ok(!response.headers.get("set-cookie")!.includes("unsub_session="));
});
