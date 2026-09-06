import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Tests for the numbers the Home screen shows.
 *
 * Stats are the easiest thing in an app to get quietly wrong — nobody notices
 * a health score that is off by ten. These pin down what each figure means.
 */

process.env.DATABASE_URL = "file::memory:";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
process.env.SESSION_SECRET = Buffer.alloc(32, 4).toString("base64");

const DAY = 86_400_000;

let db: typeof import("../src/db")["db"];
let schema: typeof import("../src/db/schema");
let computeStats: typeof import("../src/lib/api/stats")["computeStats"];
let toSenderDto: typeof import("../src/lib/api/senders")["toSenderDto"];
let accountId: string;

before(async () => {
  ({ db } = await import("../src/db"));
  const client = db.$client;

  for (const file of fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    const migration = fs.readFileSync(path.join("drizzle", file), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.execute(statement);
    }
  }

  schema = await import("../src/db/schema");
  ({ computeStats } = await import("../src/lib/api/stats"));
  ({ toSenderDto } = await import("../src/lib/api/senders"));

  const [user] = await db
    .insert(schema.users)
    .values({ email: "stats@example.com" })
    .returning();

  const [account] = await db
    .insert(schema.mailAccounts)
    .values({
      userId: user.id,
      provider: "gmail",
      email: "stats@example.com",
      accessTokenEnc: "x",
      expiresAt: Date.now() + 3_600_000,
      scope: "test",
    })
    .returning();

  accountId = account.id;

  // 100 emails of subscription volume in total:
  //   60 decided (30 unsubscribed + 10 rolled up + 20 kept)
  //   40 still active
  // Of the decided volume, 40 was decided inside the last 30 days and
  // 20 in the 30 days before that.
  await db.insert(schema.senders).values([
    {
      mailAccountId: accountId,
      address: "a@example.com",
      messageCount: 30,
      status: "UNSUBSCRIBED",
      decidedAt: new Date(Date.now() - 5 * DAY),
    },
    {
      mailAccountId: accountId,
      address: "b@example.com",
      messageCount: 10,
      status: "ROLLED_UP",
      decidedAt: new Date(Date.now() - 10 * DAY),
    },
    {
      mailAccountId: accountId,
      address: "c@example.com",
      messageCount: 20,
      status: "KEPT",
      decidedAt: new Date(Date.now() - 45 * DAY),
    },
    {
      mailAccountId: accountId,
      address: "d@example.com",
      messageCount: 40,
      status: "ACTIVE",
    },
  ]);
});

after(() => {
  db?.$client.close();
});

test("inbox health is the share of volume that has been decided", async () => {
  const stats = await computeStats(accountId);

  // 60 of 100 emails belong to senders with a decision.
  assert.equal(stats.inboxHealth, 60);
  assert.equal(stats.emailsHandled, 60);
  assert.equal(stats.totalSenders, 4);
  assert.equal(stats.activeSenders, 1);
  assert.equal(stats.activeVolume, 40);
});

test("this month counts only decisions inside the last 30 days", async () => {
  const stats = await computeStats(accountId);

  // The KEPT sender was decided 45 days ago, so two of three count.
  assert.equal(stats.handledThisMonth, 2);
});

test("time saved counts only mail that stops arriving one by one", async () => {
  const stats = await computeStats(accountId);

  // 30 unsubscribed + 10 rolled up = 40 emails, at 5 seconds each.
  // A KEPT sender still arrives, so it saves nothing.
  assert.equal(stats.timeSavedSeconds, 40 * 5);
  assert.equal(stats.timeSavedRecentSeconds, 40 * 5);
});

test("the handled delta compares this month against the one before", async () => {
  const stats = await computeStats(accountId);

  // 40 emails decided in the last 30 days, 20 in the 30 before that: +100%.
  assert.equal(stats.emailsHandledDeltaPct, 100);
});

test("an empty mailbox is healthy rather than a division by zero", async () => {
  const [user] = await db
    .insert(schema.users)
    .values({ email: "empty@example.com" })
    .returning();

  const [account] = await db
    .insert(schema.mailAccounts)
    .values({
      userId: user.id,
      provider: "gmail",
      email: "empty@example.com",
      accessTokenEnc: "x",
      expiresAt: Date.now() + 3_600_000,
      scope: "test",
    })
    .returning();

  const stats = await computeStats(account.id);

  assert.equal(stats.inboxHealth, 100);
  assert.equal(stats.emailsHandled, 0);
  assert.equal(stats.emailsHandledDeltaPct, null, "no earlier period to compare");
  assert.equal(stats.timeSavedSeconds, 0);
});

test("emails per month is measured over the span actually seen", async () => {
  const base = {
    id: "x",
    mailAccountId: accountId,
    address: "rate@example.com",
    name: null,
    sampleSubject: null,
    sampleMessageId: null,
    unsubscribeHttp: null,
    unsubscribeMailto: null,
    oneClick: false,
    status: "ACTIVE" as const,
    decidedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 60 emails across roughly six months is about ten a month.
  const sixMonths = toSenderDto({
    ...base,
    messageCount: 60,
    firstSeenAt: new Date(Date.now() - 180 * DAY),
    lastSeenAt: new Date(),
  });
  assert.equal(sixMonths.perMonth, 10);

  // A sender first seen a week ago is not averaged down over a year.
  const newSender = toSenderDto({
    ...base,
    messageCount: 8,
    firstSeenAt: new Date(Date.now() - 7 * DAY),
    lastSeenAt: new Date(),
  });
  assert.equal(newSender.perMonth, 8);

  // Unknown dates fall back to the raw count rather than dividing by zero.
  const unknown = toSenderDto({
    ...base,
    messageCount: 5,
    firstSeenAt: null,
    lastSeenAt: null,
  });
  assert.equal(unknown.perMonth, 5);
});

test("requests sent count as decisions but never as time saved", async () => {
  const [user] = await db.insert(schema.users).values({ email: "requested-stats@example.com" }).returning();
  const [account] = await db.insert(schema.mailAccounts).values({
    userId: user.id, email: user.email, accessTokenEnc: "x", expiresAt: 0, scope: "test",
  }).returning();
  await db.insert(schema.senders).values({
    mailAccountId: account.id, address: "unconfirmed@example.com", messageCount: 100,
    status: "REQUESTED", decidedAt: new Date(),
  });
  const stats = await computeStats(account.id);
  assert.equal(stats.handledThisMonth, 1);
  assert.equal(stats.emailsHandled, 100);
  assert.equal(stats.timeSavedSeconds, 0);
  assert.equal(stats.timeSavedRecentSeconds, 0);
});

test("formatDuration reads the way the design writes it", async () => {
  const { formatDuration } = await import("../src/components/senders/senderStatus");

  assert.equal(formatDuration(13_320), "3h 42m");
  assert.equal(formatDuration(3_600), "1h");
  assert.equal(formatDuration(600), "10m");
  assert.equal(formatDuration(30), "30s");
  assert.equal(formatDuration(0), "0s");
});
