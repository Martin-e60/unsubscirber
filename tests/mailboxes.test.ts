import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";

/**
 * Several Gmail mailboxes on one Tidely profile, against a real (in-memory)
 * SQLite database with every committed migration applied:
 *
 *   - an existing profile with one mailbox keeps working after the migration
 *   - every request is bound to one mailbox the caller owns
 *   - data in one mailbox never shows up in, or is changed through, another
 *   - adding, re-adding, reconnecting and removing mailboxes
 *   - signing in and adding a mailbox stay separate
 *
 * Google is never contacted: `fetch` is replaced, and the OAuth steps after
 * Google answers are exercised directly with invented tokens and profiles.
 */

process.env.DATABASE_URL = "file::memory:";
process.env.SESSION_SECRET = Buffer.alloc(32, 51).toString("base64");
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 52).toString("base64");
process.env.APP_URL = "http://localhost:3000";
process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";

type Schema = typeof import("../src/db/schema");
let db: typeof import("../src/db")["db"];
let schema: Schema;
let mailboxes: typeof import("../src/lib/mailbox/server");
let shared: typeof import("../src/lib/mailbox/shared");
let consent: typeof import("../src/lib/auth/google-consent");
let crypto: typeof import("../src/lib/crypto");
let constants: typeof import("../src/lib/constants");
let senderApi: typeof import("../src/lib/api/senders");
let stats: typeof import("../src/lib/api/stats");
let clearout: typeof import("../src/lib/clearout/server");
let tokens: typeof import("../src/lib/mail/tokens");

const realFetch = globalThis.fetch;
let revokeCalls: string[] = [];

/** Google stand-in: records revocations, answers refreshes with invalid_grant. */
function fakeGoogle() {
  revokeCalls = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/revoke")) {
      revokeCalls.push(String(init?.body ?? ""));
      return new Response("{}", { status: 200 });
    }
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    }
    throw new Error(`Unexpected request to ${url}`);
  }) as typeof fetch;
}

before(async () => {
  ({ db } = await import("../src/db"));
  schema = await import("../src/db/schema");
  mailboxes = await import("../src/lib/mailbox/server");
  shared = await import("../src/lib/mailbox/shared");
  consent = await import("../src/lib/auth/google-consent");
  crypto = await import("../src/lib/crypto");
  constants = await import("../src/lib/constants");
  senderApi = await import("../src/lib/api/senders");
  stats = await import("../src/lib/api/stats");
  clearout = await import("../src/lib/clearout/server");
  tokens = await import("../src/lib/mail/tokens");
  for (const file of fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    for (const sql of fs.readFileSync(path.join("drizzle", file), "utf8").split("--> statement-breakpoint")) {
      if (sql.trim()) await db.$client.execute(sql);
    }
  }
});

beforeEach(() => fakeGoogle());

after(() => {
  globalThis.fetch = realFetch;
  db?.$client.close();
});

// --- Helpers ---------------------------------------------------------------------------

let counter = 0;
async function makeUser(email: string, googleSub: string | null = null) {
  const [user] = await db.insert(schema.users).values({ email, googleSub }).returning();
  return user;
}

/** A mailbox row exactly as the app stored it before this change: no new columns set. */
async function legacyMailbox(userId: string, email: string, scope = constants.GOOGLE_SCOPES.join(" ")) {
  await db.$client.execute({
    sql: `INSERT INTO mail_accounts (id, user_id, provider, email, access_token_enc, refresh_token_enc, expires_at, scope, created_at, updated_at)
          VALUES (?, ?, 'gmail', ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      `legacy-${++counter}`,
      userId,
      email,
      crypto.encrypt("old-access"),
      crypto.encrypt("old-refresh"),
      Date.now() + 3_600_000,
      scope,
      Date.now() - 10 * 86_400_000 + counter,
      Date.now(),
    ],
  });
  const [row] = await db
    .select()
    .from(schema.mailAccounts)
    .where(and(eq(schema.mailAccounts.userId, userId), eq(schema.mailAccounts.email, email)));
  return row;
}

async function addSender(
  mailAccountId: string,
  address: string,
  status: import("../src/lib/constants").SenderStatus = constants.SENDER_STATUS.ACTIVE,
) {
  const [row] = await db
    .insert(schema.senders)
    .values({
      mailAccountId,
      address,
      name: address.split("@")[0],
      messageCount: 10,
      firstSeenAt: new Date(Date.now() - 60 * 86_400_000),
      lastSeenAt: new Date(),
      status,
      decidedAt: status === constants.SENDER_STATUS.ACTIVE ? null : new Date(),
    })
    .returning();
  return row;
}

function request(method: string, mailboxId?: string) {
  return new Request("http://localhost:3000/api/senders", {
    method,
    headers: mailboxId === undefined ? {} : { [shared.MAILBOX_HEADER]: mailboxId },
  });
}

const gmailTokens = (extra = "") => ({
  accessToken: `access-${++counter}`,
  refreshToken: `refresh-${counter}`,
  expiresAt: Date.now() + 3_600_000,
  scope: `${constants.GOOGLE_SCOPES.join(" ")}${extra ? ` ${extra}` : ""}`,
});

const profile = (sub: string, email: string) => ({ sub, email, email_verified: true });

const addContext = (userId: string, next: string | null = null) => ({
  intent: "add" as const,
  userId,
  mailboxId: null,
  access: null,
  next,
});

const reconnectContext = (userId: string, mailboxId: string, organise = false) => ({
  intent: "reconnect" as const,
  userId,
  mailboxId,
  access: organise ? ("organise" as const) : null,
  next: null,
});

// --- An existing profile, before and after the migration -------------------------------------

test("an existing profile with one mailbox keeps working after the migration", async () => {
  const user = await makeUser("existing@gmail.com", "google-existing");
  const old = await legacyMailbox(user.id, "existing@gmail.com");

  assert.equal(old.label, null, "no name is invented");
  assert.equal(old.needsReconnect, false);
  assert.equal(old.providerAccountId, null);
  assert.equal(user.activeMailAccountId, null);

  // No choice stored yet: the one mailbox is where the app opens…
  assert.equal((await mailboxes.rememberedMailbox(user))?.id, old.id);
  // …and an old page that sends no mailbox header can still read it.
  assert.equal((await mailboxes.mailboxForRequest(request("GET"), user)).id, old.id);
  assert.deepEqual((await mailboxes.listMailboxes(user.id)).map((row) => row.id), [old.id]);
  assert.equal(mailboxes.toMailboxDto(old).canOrganise, false);
});

// --- Every request is bound to one of the caller's own mailboxes ----------------------------

test("a request reaches only the caller's own mailbox, named explicitly for changes", async () => {
  const sam = await makeUser("sam@example.com");
  const alex = await makeUser("alex@example.com");
  const personal = await legacyMailbox(sam.id, "sam@gmail.com");
  const work = await legacyMailbox(sam.id, "sam.work@gmail.com");
  const alexBox = await legacyMailbox(alex.id, "alex@gmail.com");

  assert.equal((await mailboxes.mailboxForRequest(request("GET", personal.id), sam)).id, personal.id);
  assert.equal((await mailboxes.mailboxForRequest(request("POST", work.id), sam)).id, work.id);

  // Someone else's mailbox, a made-up id, or a malformed one: the same 404.
  for (const id of [alexBox.id, "not-a-real-id", "../../etc", ""]) {
    await assert.rejects(mailboxes.mailboxForRequest(request("GET", id), sam), {
      status: 404,
      code: shared.MAILBOX_NOT_FOUND,
    });
  }

  // A change that does not say which mailbox is refused rather than guessed.
  for (const method of ["POST", "PATCH", "DELETE"]) {
    await assert.rejects(mailboxes.mailboxForRequest(request(method), sam), {
      status: 400,
      code: shared.MAILBOX_REQUIRED,
    });
  }

  // A read without one falls back to the remembered choice.
  await mailboxes.rememberActiveMailbox(sam.id, personal.id);
  const [fresh] = await db.select().from(schema.users).where(eq(schema.users.id, sam.id));
  assert.equal((await mailboxes.mailboxForRequest(request("GET"), fresh)).id, personal.id);

  // Nobody can remember, rename or remove another person's mailbox.
  await assert.rejects(mailboxes.rememberActiveMailbox(sam.id, alexBox.id), { status: 404 });
  await assert.rejects(mailboxes.renameMailbox(sam.id, alexBox.id, "Mine now"), { status: 404 });
  await assert.rejects(mailboxes.removeMailbox(sam.id, alexBox.id), { status: 404 });
  assert.ok(await mailboxes.findOwnedMailbox(alex.id, alexBox.id), "Alex's mailbox is untouched");
});

test("a profile with no mailbox gets a clear answer, not someone else's data", async () => {
  const empty = await makeUser("empty@example.com");
  await assert.rejects(mailboxes.mailboxForRequest(request("GET"), empty), { status: 409 });
  assert.equal(await mailboxes.rememberedMailbox(empty), null);
  assert.equal(await mailboxes.hasMailbox(empty.id), false);
});

// --- Data isolation --------------------------------------------------------------------

test("senders, counts, stats and Clear out History stay inside their own mailbox", async () => {
  const user = await makeUser("iso@example.com");
  const personal = await legacyMailbox(user.id, "iso@gmail.com");
  const work = await legacyMailbox(user.id, "iso.work@gmail.com");

  const shop = await addSender(personal.id, "news@shop.example.com");
  await addSender(personal.id, "deals@shop.example.com", constants.SENDER_STATUS.UNSUBSCRIBED);
  const jobs = await addSender(work.id, "alerts@jobs.example.com");

  const personalList = await senderApi.listSenders({ mailAccountId: personal.id, status: "ALL" });
  const workList = await senderApi.listSenders({ mailAccountId: work.id, status: "ALL" });
  assert.deepEqual(personalList.rows.map((row) => row.address).sort(), [
    "deals@shop.example.com",
    "news@shop.example.com",
  ]);
  assert.deepEqual(workList.rows.map((row) => row.address), ["alerts@jobs.example.com"]);

  // Search runs inside the mailbox too.
  const search = await senderApi.listSenders({ mailAccountId: work.id, status: "ALL", search: "shop" });
  assert.equal(search.rows.length, 0);

  assert.equal((await senderApi.countByStatus(personal.id))[constants.SENDER_STATUS.UNSUBSCRIBED], 1);
  assert.equal((await senderApi.countByStatus(work.id))[constants.SENDER_STATUS.UNSUBSCRIBED], 0);
  assert.equal((await stats.computeStats(personal.id)).confirmedUnsubscribes, 1);
  assert.equal((await stats.computeStats(work.id)).confirmedUnsubscribes, 0);

  // A sender id from one mailbox cannot be changed through the other.
  await assert.rejects(senderApi.changeSenderStatus(work.id, shop.id, constants.SENDER_STATUS.KEPT));
  const [unchanged] = await db.select().from(schema.senders).where(eq(schema.senders.id, shop.id));
  assert.equal(unchanged.status, constants.SENDER_STATUS.ACTIVE);
  await senderApi.changeSenderStatus(work.id, jobs.id, constants.SENDER_STATUS.KEPT);

  const run = await clearout.createRun(work.id, { action: "archive", requested: 3, labelId: null, labelName: null });
  assert.equal(await clearout.findRun(personal.id, run.id), null);
  assert.equal((await clearout.listRuns(personal.id)).length, 0);
  assert.equal((await clearout.listRuns(work.id)).length, 1);
});

test("every API route that reads or changes mail resolves its mailbox from the request", () => {
  // A guard against a new route quietly going back to "the user's mailbox".
  const routes: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") routes.push(full);
    }
  };
  walk("src/app/api");

  const mailRoutes = routes.filter((file) =>
    /api[\\/](scan|senders|unsubscribe|unsubscribed|history|stats|clear-out)[\\/]/.test(file),
  );
  assert.ok(mailRoutes.length >= 15, "found the mailbox routes");
  for (const file of mailRoutes) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /requireUserAndMailbox\(request\)/, `${file} names its mailbox`);
  }
  for (const file of routes) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /getPrimaryAccount|requireAccount\(/, `${file} does not guess a mailbox`);
  }
});

// --- Adding, re-adding, reconnecting ------------------------------------------------------

test("adding a second Gmail keeps the first, never touches the Google sign-in, and opens on the new one", async () => {
  const user = await makeUser("kai@gmail.com", "google-kai");
  const first = await legacyMailbox(user.id, "kai@gmail.com");

  const outcome = await consent.completeMailboxConsent({
    context: addContext(user.id, "/cleanup"),
    user,
    tokens: gmailTokens(),
    profile: profile("google-kai-work", "Kai.Work@Gmail.com"),
  });

  const rows = await mailboxes.listMailboxes(user.id);
  assert.equal(rows.length, 2);
  const added = rows.find((row) => row.id !== first.id)!;
  assert.equal(added.email, "kai.work@gmail.com", "stored lower-case");
  assert.equal(added.providerAccountId, "google-kai-work");
  assert.equal(added.label, null, "not named for the person");
  assert.deepEqual(outcome, {
    path: "/cleanup",
    params: { [shared.MAILBOX_PARAM]: added.id, [shared.MAILBOX_STATUS_PARAM]: "added" },
  });

  const [after] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  assert.equal(after.googleSub, "google-kai", "the sign-in identity is unchanged");
  assert.equal(after.activeMailAccountId, added.id, "the next visit opens on the new mailbox");
  assert.ok(await mailboxes.findOwnedMailbox(user.id, first.id), "the first mailbox is still there");
});

test("tokens are stored encrypted, and adding the same mailbox again refreshes it instead of duplicating", async () => {
  const user = await makeUser("rio@example.com");
  const t1 = gmailTokens();
  await consent.completeMailboxConsent({
    context: addContext(user.id),
    user,
    tokens: t1,
    profile: profile("google-rio", "rio@gmail.com"),
  });
  const [stored] = await mailboxes.listMailboxes(user.id);
  assert.notEqual(stored.accessTokenEnc, t1.accessToken);
  assert.ok(!stored.refreshTokenEnc!.includes(t1.refreshToken!));
  assert.equal(crypto.decrypt(stored.accessTokenEnc), t1.accessToken);
  assert.equal(crypto.decrypt(stored.refreshTokenEnc!), t1.refreshToken);

  // Google often returns no refresh token on a repeat consent: the stored one is kept.
  const t2 = { ...gmailTokens(), refreshToken: null };
  const again = await consent.completeMailboxConsent({
    context: addContext(user.id),
    user,
    tokens: t2,
    profile: profile("google-rio", "rio@gmail.com"),
  });
  const rows = await mailboxes.listMailboxes(user.id);
  assert.equal(rows.length, 1, "no duplicate");
  assert.equal(again.params[shared.MAILBOX_STATUS_PARAM], "already_connected");
  assert.equal(crypto.decrypt(rows[0].accessTokenEnc), t2.accessToken);
  assert.equal(crypto.decrypt(rows[0].refreshTokenEnc!), t1.refreshToken);

  // The same Google account under a new address is still the same mailbox.
  await consent.completeMailboxConsent({
    context: addContext(user.id),
    user,
    tokens: gmailTokens(),
    profile: profile("google-rio", "rio.renamed@gmail.com"),
  });
  const renamed = await mailboxes.listMailboxes(user.id);
  assert.equal(renamed.length, 1);
  assert.equal(renamed[0].email, "rio.renamed@gmail.com");
});

test("a mailbox without Gmail permission is not connected", async () => {
  const user = await makeUser("partial@example.com");
  await legacyMailbox(user.id, "partial@gmail.com");
  const outcome = await consent.completeMailboxConsent({
    context: addContext(user.id),
    user,
    tokens: { ...gmailTokens(), scope: "openid https://www.googleapis.com/auth/userinfo.email" },
    profile: profile("google-partial-2", "partial.two@gmail.com"),
  });
  assert.deepEqual(outcome.params, { [shared.MAILBOX_ERROR_PARAM]: "missing_permissions" });
  assert.equal((await mailboxes.listMailboxes(user.id)).length, 1);
});

test("a reconnect must come back as the same Google account, and only refreshes that mailbox", async () => {
  const user = await makeUser("ana@example.com");
  const personal = await legacyMailbox(user.id, "ana@gmail.com");
  const work = await legacyMailbox(user.id, "ana.work@gmail.com");
  await mailboxes.markNeedsReconnect(work.id);

  // A different Google account: refused, nothing stored.
  const wrong = await consent.completeMailboxConsent({
    context: reconnectContext(user.id, work.id),
    user,
    tokens: gmailTokens(),
    profile: profile("google-ana", "ana@gmail.com"),
  });
  assert.deepEqual(wrong.params, { [shared.MAILBOX_ERROR_PARAM]: "wrong_account" });
  let [row] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, work.id));
  assert.equal(crypto.decrypt(row.accessTokenEnc), "old-access");
  assert.equal(row.needsReconnect, true);

  // The right one: a legacy mailbox is matched by address, then remembers Google's id.
  const fresh = gmailTokens(constants.GMAIL_MODIFY_SCOPE);
  const ok = await consent.completeMailboxConsent({
    context: reconnectContext(user.id, work.id),
    user,
    tokens: fresh,
    profile: profile("google-ana-work", "ana.work@gmail.com"),
  });
  assert.deepEqual(ok, { path: "/settings", params: { [shared.MAILBOX_STATUS_PARAM]: "reconnected" } });
  [row] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, work.id));
  assert.equal(crypto.decrypt(row.accessTokenEnc), fresh.accessToken);
  assert.equal(row.providerAccountId, "google-ana-work");
  assert.equal(row.needsReconnect, false);

  // From now on the account id decides, not the address.
  const impostor = await consent.completeMailboxConsent({
    context: reconnectContext(user.id, work.id),
    user,
    tokens: gmailTokens(),
    profile: profile("someone-else", "ana.work@gmail.com"),
  });
  assert.equal(impostor.params[shared.MAILBOX_ERROR_PARAM], "wrong_account");

  // The other mailbox was never touched.
  const [other] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, personal.id));
  assert.equal(crypto.decrypt(other.accessTokenEnc), "old-access");
});

test("a reconnect for a mailbox that is not the caller's stores nothing", async () => {
  const owner = await makeUser("owner@example.com");
  const intruder = await makeUser("intruder@example.com");
  await legacyMailbox(intruder.id, "intruder@gmail.com");
  const box = await legacyMailbox(owner.id, "owner@gmail.com");

  const outcome = await consent.completeMailboxConsent({
    context: reconnectContext(intruder.id, box.id),
    user: intruder,
    tokens: gmailTokens(),
    profile: profile("google-owner", "owner@gmail.com"),
  });
  assert.equal(outcome.params[shared.MAILBOX_ERROR_PARAM], "not_found");
  const [row] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, box.id));
  assert.equal(crypto.decrypt(row.accessTokenEnc), "old-access");
});

test("Clear out's organise reconnect reports granted or declined on Clear out, for that mailbox", async () => {
  const user = await makeUser("org@example.com");
  const box = await legacyMailbox(user.id, "org@gmail.com");
  const declined = await consent.completeMailboxConsent({
    context: reconnectContext(user.id, box.id, true),
    user,
    tokens: gmailTokens(),
    profile: profile("google-org", "org@gmail.com"),
  });
  assert.deepEqual(declined, { path: "/clear-out", params: { access: "declined", [shared.MAILBOX_PARAM]: box.id } });

  const granted = await consent.completeMailboxConsent({
    context: reconnectContext(user.id, box.id, true),
    user,
    tokens: gmailTokens(constants.GMAIL_MODIFY_SCOPE),
    profile: profile("google-org", "org@gmail.com"),
  });
  assert.equal(granted.params.access, "granted");
  const [row] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, box.id));
  assert.equal(mailboxes.toMailboxDto(row).canOrganise, true);
});

test("cancelling at Google goes back with a message and changes nothing", async () => {
  const user = await makeUser("cancel@example.com");
  await legacyMailbox(user.id, "cancel@gmail.com");
  assert.deepEqual(await consent.mailboxFailure(addContext(user.id, "/clear-out"), user, "cancelled"), {
    path: "/clear-out",
    params: { [shared.MAILBOX_ERROR_PARAM]: "cancelled" },
  });
  // With no mailbox at all, the person is sent to the connect step to read it.
  const none = await makeUser("none@example.com");
  assert.equal((await consent.mailboxFailure(addContext(none.id, "/cleanup"), none, "failed")).path, "/connect");
});

// --- Signing in stays separate from mailboxes --------------------------------------------------

test("signing up with Google connects that Gmail; signing in later never re-adds a removed one", async () => {
  const first = await consent.completeSignIn({
    tokens: gmailTokens(),
    profile: { ...profile("google-new", "new.person@gmail.com"), name: "New Person" },
    next: null,
  });
  assert.equal(first.destination, "/dashboard");
  const [box] = await mailboxes.listMailboxes(first.user.id);
  assert.equal(box.email, "new.person@gmail.com");
  assert.equal(box.providerAccountId, "google-new");

  await mailboxes.removeMailbox(first.user.id, box.id);
  const again = await consent.completeSignIn({
    tokens: gmailTokens(),
    profile: profile("google-new", "new.person@gmail.com"),
    next: "/cleanup",
  });
  assert.equal(again.user.id, first.user.id, "the same Tidely profile");
  assert.equal((await mailboxes.listMailboxes(first.user.id)).length, 0, "the removed mailbox stays removed");
  assert.equal(again.destination, "/connect");
});

test("signing in refreshes the sign-in account's mailbox if it is still connected, and nothing else", async () => {
  const { user } = await consent.completeSignIn({
    tokens: gmailTokens(),
    profile: profile("google-lee", "lee@gmail.com"),
    next: null,
  });
  const [own] = await mailboxes.listMailboxes(user.id);
  await consent.completeMailboxConsent({
    context: addContext(user.id),
    user,
    tokens: gmailTokens(),
    profile: profile("google-lee-work", "lee.work@gmail.com"),
  });
  await mailboxes.markNeedsReconnect(own.id);

  const signIn = gmailTokens();
  const result = await consent.completeSignIn({ tokens: signIn, profile: profile("google-lee", "lee@gmail.com"), next: "/cleanup" });
  assert.equal(result.destination, "/cleanup");
  const rows = await mailboxes.listMailboxes(user.id);
  assert.equal(rows.length, 2);
  const refreshed = rows.find((row) => row.id === own.id)!;
  assert.equal(crypto.decrypt(refreshed.accessTokenEnc), signIn.accessToken);
  assert.equal(refreshed.needsReconnect, false);
  const work = rows.find((row) => row.id !== own.id)!;
  assert.notEqual(crypto.decrypt(work.accessTokenEnc), signIn.accessToken, "the other mailbox keeps its own grant");
});

// --- Removing ----------------------------------------------------------------------------

test("removing a mailbox deletes only its data and keeps the profile and the other mailboxes", async () => {
  const user = await makeUser("rm@example.com");
  const personal = await legacyMailbox(user.id, "rm@gmail.com");
  const work = await legacyMailbox(user.id, "rm.work@gmail.com");
  await addSender(personal.id, "a@shop.example.com");
  await addSender(work.id, "b@jobs.example.com");
  await mailboxes.rememberActiveMailbox(user.id, work.id);

  const result = await mailboxes.removeMailbox(user.id, work.id);
  assert.equal(result.removed.id, work.id);
  assert.deepEqual(result.remaining.map((row) => row.id), [personal.id]);
  assert.equal(result.activeMailboxId, personal.id, "the remembered choice moves to one that remains");
  assert.equal(revokeCalls.length, 1, "Google was asked to revoke that mailbox's grant");

  const left = await db.select().from(schema.senders);
  assert.ok(left.some((row) => row.mailAccountId === personal.id));
  assert.ok(!left.some((row) => row.mailAccountId === work.id), "its senders went with it");
  const [stillThere] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  assert.ok(stillThere, "the Tidely profile stays");

  // Removing the last one leaves a profile with nothing selected.
  const last = await mailboxes.removeMailbox(user.id, personal.id);
  assert.equal(last.activeMailboxId, null);
  assert.equal(await mailboxes.hasMailbox(user.id), false);
  const [empty] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  assert.equal(empty.activeMailAccountId, null);
});

test("removing a mailbox another profile also connected leaves that profile's grant alone", async () => {
  const a = await makeUser("share-a@example.com");
  const b = await makeUser("share-b@example.com");
  const boxA = await legacyMailbox(a.id, "shared@gmail.com");
  await legacyMailbox(b.id, "shared@gmail.com");
  await mailboxes.removeMailbox(a.id, boxA.id);
  assert.equal(revokeCalls.length, 0, "revoking would have disconnected the other profile too");
  assert.equal((await mailboxes.listMailboxes(b.id)).length, 1);
});

// --- Names and expired grants --------------------------------------------------------------

test("mailbox names are the person's own, tidied and limited", async () => {
  assert.deepEqual(shared.normaliseMailboxLabel("  Work   stuff \n"), { ok: true, label: "Work stuff" });
  assert.deepEqual(shared.normaliseMailboxLabel("   "), { ok: true, label: null });
  assert.deepEqual(shared.normaliseMailboxLabel(null), { ok: true, label: null });
  assert.equal(shared.normaliseMailboxLabel("x".repeat(shared.MAILBOX_LABEL_MAX + 1)).ok, false);
  assert.equal(shared.normaliseMailboxLabel(42).ok, false);

  const user = await makeUser("names@example.com");
  const box = await legacyMailbox(user.id, "names@gmail.com");
  const renamed = await mailboxes.renameMailbox(user.id, box.id, "Personal");
  assert.equal(renamed.label, "Personal");
  assert.equal(shared.mailboxTitle(renamed), "Personal");
  const cleared = await mailboxes.renameMailbox(user.id, box.id, null);
  assert.equal(shared.mailboxTitle(cleared), "names@gmail.com");
});

test("a grant Google no longer accepts marks that mailbox, and only that one, for reconnecting", async () => {
  const user = await makeUser("expired@example.com");
  const stale = await legacyMailbox(user.id, "expired@gmail.com");
  const fine = await legacyMailbox(user.id, "fine@gmail.com");
  await db.update(schema.mailAccounts).set({ expiresAt: Date.now() - 1000 }).where(eq(schema.mailAccounts.id, stale.id));
  const [expired] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, stale.id));

  await assert.rejects(tokens.getValidAccessToken(expired), { name: "TokenRefreshError" });
  const rows = await mailboxes.listMailboxes(user.id);
  assert.equal(rows.find((row) => row.id === stale.id)!.needsReconnect, true);
  assert.equal(rows.find((row) => row.id === fine.id)!.needsReconnect, false);
});

// --- Choosing the tab's mailbox ------------------------------------------------------------

test("a tab opens on the mailbox it asked for, then its own, then the remembered one", () => {
  const ids = ["a", "b", "c"];
  assert.equal(shared.pickActiveMailbox(ids, { fromUrl: "c", fromTab: "b", remembered: "a" }), "c");
  assert.equal(shared.pickActiveMailbox(ids, { fromUrl: "gone", fromTab: "b", remembered: "a" }), "b");
  assert.equal(shared.pickActiveMailbox(ids, { fromTab: "gone", remembered: "a" }), "a");
  assert.equal(shared.pickActiveMailbox(ids, { remembered: "gone" }), "a", "first connected");
  assert.equal(shared.pickActiveMailbox([], { remembered: "a" }), null);
});

test("links for reconnecting and adding carry the mailbox and a return path", () => {
  assert.equal(
    shared.reconnectHref("m-1", { next: "/settings" }),
    "/api/auth/google/start?mode=reconnect&mailbox=m-1&next=%2Fsettings",
  );
  assert.equal(shared.addMailboxHref("/cleanup"), "/connect?add=1&next=%2Fcleanup");
  assert.equal(clearout.grantUrlFor({ id: "m-2" }), "/api/auth/google/start?mode=reconnect&mailbox=m-2&access=organise&next=%2Fclear-out");
});
