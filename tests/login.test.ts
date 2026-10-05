import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";

/**
 * Signing in and recovering a password: where people are sent afterwards,
 * and the reset flow end to end against a real (in-memory) database.
 * Nothing here sends an email — the sender is a stub that records messages.
 */

process.env.DATABASE_URL = "file::memory:";
process.env.SESSION_SECRET = Buffer.alloc(32, 41).toString("base64");
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 42).toString("base64");
process.env.APP_URL = "http://localhost:3000";

let db: typeof import("../src/db")["db"];
let schema: typeof import("../src/db/schema");
let credentials: typeof import("../src/lib/auth/credentials");
let reset: typeof import("../src/lib/auth/password-reset");
let next: typeof import("../src/lib/auth/next");
let rules: typeof import("../src/lib/auth/session-rules");
const original = "the original long passphrase";

before(async () => {
  ({ db } = await import("../src/db"));
  schema = await import("../src/db/schema");
  credentials = await import("../src/lib/auth/credentials");
  reset = await import("../src/lib/auth/password-reset");
  next = await import("../src/lib/auth/next");
  rules = await import("../src/lib/auth/session-rules");
  for (const file of fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    for (const sql of fs.readFileSync(path.join("drizzle", file), "utf8").split("--> statement-breakpoint")) {
      if (sql.trim()) await db.$client.execute(sql);
    }
  }
  await credentials.registerWithPassword({ name: "Robin", email: "robin@example.com", password: original });
});
after(() => db?.$client.close());

// --- Where to go after signing in ---------------------------------------------------

test("only safe internal app paths survive as a return destination", () => {
  const { safeNextPath } = next;
  assert.equal(safeNextPath("/clear-out?unread=1&older=6m"), "/clear-out?unread=1&older=6m");
  assert.equal(safeNextPath("/cleanup"), "/cleanup");
  assert.equal(safeNextPath("/settings#mailbox"), "/settings#mailbox");

  for (const hostile of [
    "https://evil.example/dashboard",
    "//evil.example/dashboard",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/dashboard\n//evil",
    " /dashboard",
    "/api/auth/logout",
    "/login",
    "/register",
    "/reset-password",
    "/dashboard/../api/account",
    "/%2F%2Fevil.example",
    "/",
    "",
    "x".repeat(600),
    42,
    null,
  ]) {
    assert.equal(safeNextPath(hostile), null, `rejects ${JSON.stringify(hostile)}`);
  }
});

test("the sign-in link carries a return path only when it is safe", () => {
  assert.equal(next.loginHref("/clear-out"), "/login?next=%2Fclear-out");
  assert.equal(next.loginHref("/dashboard"), "/login", "Home is the default anyway");
  assert.equal(next.loginHref("https://evil.example"), "/login");
  assert.equal(next.loginHref(null), "/login");
});

test("Google sign-in keeps a safe return path in its signed state, and drops a hostile one", async () => {
  const { createOAuthState, readOAuthState } = await import("../src/lib/auth/oauth-state");
  const kept = await createOAuthState("s1", { intent: "login", userId: null, next: "/clear-out?unread=1" });
  assert.equal((await readOAuthState(kept, "s1"))?.next, "/clear-out?unread=1");
  const dropped = await createOAuthState("s2", { intent: "login", userId: null, next: "//evil.example" });
  assert.equal((await readOAuthState(dropped, "s2"))?.next, null);
});

// --- Password recovery ----------------------------------------------------------------

function inbox() {
  const sent: import("../src/lib/mail/system").SystemEmail[] = [];
  return { sent, send: async (message: (typeof sent)[number]) => void sent.push(message) };
}

function tokenFrom(text: string): string {
  const match = /reset-password#token=([A-Za-z0-9_-]{43})/.exec(text);
  assert.ok(match, "the email carries a reset link");
  return match[1];
}

test("asking for a reset says nothing about whether the account exists", async () => {
  const known = inbox();
  const unknown = inbox();
  await reset.requestPasswordReset("Robin@Example.com", known.send);
  await reset.requestPasswordReset("nobody@example.com", unknown.send);
  assert.equal(known.sent.length, 1, "the account holder gets a link");
  assert.equal(unknown.sent.length, 0, "an unknown address gets nothing");
  assert.equal(known.sent[0].to, "robin@example.com");
  assert.match(known.sent[0].text, /http:\/\/localhost:3000\/reset-password#token=/, "the token is in the fragment");
  await assert.rejects(reset.requestPasswordReset("not an email", known.send), { status: 400 });
});

test("only a hash of the token is stored, and a new request replaces the old link", async () => {
  const first = inbox();
  const second = inbox();
  await reset.requestPasswordReset("robin@example.com", first.send);
  await reset.requestPasswordReset("robin@example.com", second.send);
  const rows = await db.select().from(schema.passwordResetTokens);
  assert.equal(rows.length, 1, "one live link per account");
  const token = tokenFrom(second.sent[0].text);
  assert.equal(rows[0].tokenHash, reset.hashResetToken(token));
  assert.ok(!rows.some((row) => row.tokenHash === token), "the raw token is never stored");
  await assert.rejects(reset.resetPassword({ token: tokenFrom(first.sent[0].text), password: "a brand new passphrase" }), {
    status: 400,
  });
});

test("a reset changes the password once, and older sessions stop counting", async () => {
  const mail = inbox();
  const now = Date.now();
  await reset.requestPasswordReset("robin@example.com", mail.send, now);
  const token = tokenFrom(mail.sent[0].text);

  await assert.rejects(reset.resetPassword({ token, password: "too short" }, now), { status: 400 });
  const userId = await reset.resetPassword({ token, password: "a brand new passphrase" }, now + 1000);

  assert.equal(await credentials.loginWithPassword({ email: "robin@example.com", password: "a brand new passphrase" }), userId);
  await assert.rejects(credentials.loginWithPassword({ email: "robin@example.com", password: original }), { status: 401 });
  await assert.rejects(reset.resetPassword({ token, password: "yet another passphrase" }, now + 2000), {
    status: 400,
    message: /expired or has already been used/,
  });

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const changed = user.passwordChangedAt!;
  const before = Math.floor(changed.getTime() / 1000) - 60;
  const after = Math.floor(changed.getTime() / 1000) + 5;
  assert.equal(rules.issuedBeforePasswordChange(before, changed), true, "a session from before the reset is out");
  assert.equal(rules.issuedBeforePasswordChange(after, changed), false, "signing in again afterwards works");
  assert.equal(rules.issuedBeforePasswordChange(before, null), false, "accounts that never reset are unaffected");
});

test("a reset link expires after 30 minutes", async () => {
  const mail = inbox();
  const now = Date.now();
  await reset.requestPasswordReset("robin@example.com", mail.send, now);
  await assert.rejects(
    reset.resetPassword({ token: tokenFrom(mail.sent[0].text), password: "a later passphrase" }, now + reset.RESET_TTL_MS + 1),
    { status: 400 },
  );
});

test("recovery is offered only where a link can be delivered", async () => {
  const mail = await import("../src/lib/mail/system");
  const env = process.env as Record<string, string | undefined>;
  const saved = { node: env.NODE_ENV, key: env.RESEND_API_KEY, from: env.EMAIL_FROM };
  try {
    delete env.RESEND_API_KEY;
    delete env.EMAIL_FROM;
    env.NODE_ENV = "production";
    assert.equal(mail.passwordRecoveryAvailable(), false, "no provider in production: no Forgot password link");
    await assert.rejects(mail.sendSystemEmail({ to: "a@example.com", subject: "x", text: "y" }));
    env.RESEND_API_KEY = "re_test";
    env.EMAIL_FROM = "Tidely <hello@example.com>";
    assert.equal(mail.passwordRecoveryAvailable(), true);
  } finally {
    env.NODE_ENV = saved.node;
    if (saved.key === undefined) delete env.RESEND_API_KEY;
    else env.RESEND_API_KEY = saved.key;
    if (saved.from === undefined) delete env.EMAIL_FROM;
    else env.EMAIL_FROM = saved.from;
  }
});
