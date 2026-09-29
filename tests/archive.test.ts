import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * The Unsubscribed archive end to end: real scans into a real SQLite database
 * from a fake mailbox, then the archive the page reads.
 */

process.env.DATABASE_URL = "file::memory:?cache=shared";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
process.env.SESSION_SECRET = Buffer.alloc(32, 6).toString("base64");

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

type Mod = {
  db: typeof import("../src/db")["db"];
  schema: typeof import("../src/db/schema");
  scan: typeof import("../src/lib/scan/engine");
  archive: typeof import("../src/lib/api/unsubscribed");
};
let mod: Mod;
let account: import("../src/db/schema").MailAccount;
let keeper: import("@libsql/client").Client;
const ids: Record<string, string> = {};

/** A mailbox that serves one page and counts anything that is not a read. */
function mailbox(messages: Partial<import("../src/lib/mail/provider").MessageHeaders>[], fail = false) {
  const writes = { sent: 0, bodies: 0 };
  return {
    writes,
    provider: {
      name: "fake",
      address: "sam@example.com",
      async listSubscriptionMessages() {
        if (fail) throw new Error("Gmail API 401: token expired. Reconnect the account.");
        return {
          messages: messages.map((m, i) => ({
            id: m.id ?? `x${i}`,
            from: m.from ?? null,
            subject: m.subject ?? null,
            date: m.date ?? null,
            listUnsubscribe: m.listUnsubscribe ?? null,
            listUnsubscribePost: null,
            listId: m.listId ?? null,
            precedence: m.precedence ?? null,
          })),
          nextPageToken: null,
          totalEstimate: messages.length,
        };
      },
      async getMessageHtml() {
        writes.bodies++;
        return null;
      },
      async sendMail() {
        writes.sent++;
      },
    } as import("../src/lib/mail/provider").MailProvider,
  };
}

// The weekly list at news@, and what else arrives around it.
const inbox = [
  // Before the unsubscribe ten days ago: establishes the list's List-Id.
  { id: "a1", from: "Kettle <news@kettle.example>", subject: "Old issue", date: ago(20),
    listUnsubscribe: "<https://kettle.example/u>", listId: "Kettle Weekly <weekly.kettle.example>" },
  // After it: the same list writes again.
  { id: "a2", from: "Kettle <news@kettle.example>", subject: "We miss you", date: ago(5),
    listUnsubscribe: "<https://kettle.example/u>", listId: "<weekly.kettle.example>" },
  // After it, same address, a different list: not this subscription.
  { id: "a3", from: "Kettle <news@kettle.example>", subject: "Your order shipped", date: ago(3),
    listUnsubscribe: "<https://kettle.example/u>", listId: "<orders.kettle.example>" },
  // Same company, another address: another sender entirely.
  { id: "a4", from: "Kettle Offers <offers@kettle.example>", subject: "20% off", date: ago(2),
    listUnsubscribe: "<https://kettle.example/o>" },
  // A plain receipt with no list headers is never recorded at all.
  { id: "a5", from: "Kettle <news@kettle.example>", subject: "Receipt", date: ago(1) },
];

before(async () => {
  const { createClient } = await import("@libsql/client");
  keeper = createClient({ url: process.env.DATABASE_URL! });
  const dbModule = await import("../src/db");
  for (const file of fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    const migration = fs.readFileSync(path.join("drizzle", file), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) await dbModule.db.$client.execute(statement);
    }
  }
  mod = {
    db: dbModule.db,
    schema: await import("../src/db/schema"),
    scan: await import("../src/lib/scan/engine"),
    archive: await import("../src/lib/api/unsubscribed"),
  };
  const { schema, db } = mod;

  const [user] = await db.insert(schema.users).values({ email: "sam@example.com" }).returning();
  [account] = await db.insert(schema.mailAccounts).values({
    userId: user.id, provider: "gmail", email: "sam@example.com",
    accessTokenEnc: "x", expiresAt: Date.now() + 3_600_000, scope: "test",
  }).returning();

  const sender = async (key: string, values: Partial<typeof schema.senders.$inferInsert>) => {
    const [row] = await db.insert(schema.senders).values({
      mailAccountId: account.id, address: `${key}@example.org`, name: key, ...values,
    }).returning();
    ids[key] = row.id;
    return row;
  };

  const kettle = await sender("kettle", {
    address: "news@kettle.example", name: "Kettle", status: "UNSUBSCRIBED", decidedAt: ago(10),
  });
  await db.insert(schema.unsubscribeAttempts).values({
    senderId: kettle.id, method: "ONE_CLICK", status: "SUCCESS", detail: "HTTP 200", createdAt: ago(10),
  });
  // A record from before attempts or dates were kept.
  await sender("legacy", { status: "UNSUBSCRIBED" });
  // Not confirmed, so never in the archive.
  await sender("requested", { status: "REQUESTED", decidedAt: ago(4) });
  await sender("manual", { status: "MANUAL", decidedAt: ago(4) });
  await sender("failed", { status: "FAILED", decidedAt: ago(4) });
  await sender("active", {});
});

after(() => {
  mod?.db.$client.close();
  keeper?.close();
});

async function runScan(box: ReturnType<typeof mailbox>) {
  const scan = await mod.scan.startScan(account, 30);
  return mod.scan.runScanStep(account, scan, box.provider);
}

test("the archive holds confirmed unsubscribes only", async () => {
  const result = await mod.archive.listArchive({ account, limit: 10, offset: 0 });
  assert.deepEqual(result.items.map((i) => i.name).sort(), ["Kettle", "legacy"]);
  assert.equal(result.archiveTotal, 2);
  assert.equal(result.lastCheck, null);
  const kettle = result.items.find((i) => i.name === "Kettle")!;
  assert.equal(kettle.observation, "NOT_CHECKED");
  assert.equal(kettle.notCheckedReason, "NO_CHECK");
  assert.ok(
    Math.abs(new Date(kettle.unsubscribedAt!).getTime() - ago(10).getTime()) < 5_000,
    "the date comes from the confirmed attempt",
  );
});

test("a check finds the list writing again, and nothing else, without writing to Gmail", async () => {
  const box = mailbox(inbox);
  const progress = await runScan(box);
  assert.equal(progress.status, "DONE");
  assert.deepEqual(box.writes, { sent: 0, bodies: 0 }, "checking only reads headers");

  const result = await mod.archive.listArchive({ account, limit: 10, offset: 0 });
  const kettle = result.items.find((i) => i.name === "Kettle")!;
  assert.equal(kettle.observation, "NEW_MAIL");
  assert.equal(kettle.matchedBy, "LIST_ID");
  assert.equal(kettle.newCount, 1, "the orders list and the other address do not count");
  assert.equal(kettle.newMessages[0].subject, "We miss you");
  assert.ok(
    Math.abs(new Date(kettle.newMessages[0].receivedAt).getTime() - ago(5).getTime()) < 5_000,
    "the date is when the mail arrived, not when the scan ran",
  );
  assert.equal(kettle.newMessages[0].gmailUrl, "https://mail.google.com/mail/?authuser=sam%40example.com#all/a2");
  assert.equal(kettle.check?.found, 1);
  assert.equal(kettle.check?.partial, false);

  const legacy = result.items.find((i) => i.name === "legacy")!;
  assert.equal(legacy.observation, "NOT_CHECKED");
  assert.equal(legacy.notCheckedReason, "NO_DATE");
  assert.equal(result.lastCheck?.lookbackDays, 30);
});

test("subjects are kept only for mail after a confirmed unsubscribe", async () => {
  const { eq } = await import("drizzle-orm");
  const rows = await mod.db.select().from(mod.schema.scannedMessages)
    .where(eq(mod.schema.scannedMessages.mailAccountId, account.id));
  const byId = new Map(rows.map((row) => [row.messageId, row]));
  assert.equal(byId.get("a1")?.subject, null, "mail from before the unsubscribe keeps no subject");
  assert.equal(byId.get("a2")?.subject, "We miss you");
  assert.equal(byId.get("a4")?.subject, null, "an undecided sender's subjects are not stored");
  assert.equal(byId.has("a5"), false, "a receipt without list headers is never recorded");
  assert.equal(byId.get("a2")?.listId, "weekly.kettle.example");
});

test("rescanning the same mail neither duplicates it nor changes the confirmed status", async () => {
  const { eq } = await import("drizzle-orm");
  const before = await mod.db.select().from(mod.schema.scannedMessages)
    .where(eq(mod.schema.scannedMessages.mailAccountId, account.id));
  await runScan(mailbox(inbox));
  const afterRows = await mod.db.select().from(mod.schema.scannedMessages)
    .where(eq(mod.schema.scannedMessages.mailAccountId, account.id));
  assert.equal(afterRows.length, before.length);

  const [kettle] = await mod.db.select().from(mod.schema.senders)
    .where(eq(mod.schema.senders.id, ids.kettle));
  assert.equal(kettle.status, "UNSUBSCRIBED", "new mail is an observation, not a failed unsubscribe");

  const result = await mod.archive.listArchive({ account, limit: 10, offset: 0 });
  assert.equal(result.items.find((i) => i.name === "Kettle")?.newCount, 1);
});

test("older rows without a date get one from a later scan", async () => {
  const { and, eq } = await import("drizzle-orm");
  await mod.db.update(mod.schema.scannedMessages).set({ receivedAt: null })
    .where(and(eq(mod.schema.scannedMessages.mailAccountId, account.id),
      eq(mod.schema.scannedMessages.messageId, "a2")));
  await runScan(mailbox(inbox));
  const [row] = await mod.db.select().from(mod.schema.scannedMessages)
    .where(and(eq(mod.schema.scannedMessages.mailAccountId, account.id),
      eq(mod.schema.scannedMessages.messageId, "a2")));
  assert.ok(row.receivedAt, "the missing date was filled in");
});

test("a failed check never replaces the last successful one", async () => {
  const beforeFail = await mod.archive.listArchive({ account, limit: 10, offset: 0 });
  const box = mailbox([], true);
  const progress = await runScan(box);
  assert.equal(progress.status, "ERROR");
  assert.match(progress.error ?? "", /reconnect/i);

  const afterFail = await mod.archive.listArchive({ account, limit: 10, offset: 0 });
  assert.equal(afterFail.lastCheck?.finishedAt, beforeFail.lastCheck?.finishedAt);
  assert.deepEqual(
    afterFail.items.map((i) => [i.name, i.observation]),
    beforeFail.items.map((i) => [i.name, i.observation]),
  );
});

test("search matches name or address and keeps the archive total apart", async () => {
  const byAddress = await mod.archive.listArchive({ account, search: "KETTLE.example", limit: 10, offset: 0 });
  assert.deepEqual(byAddress.items.map((i) => i.name), ["Kettle"]);
  assert.equal(byAddress.total, 1);
  assert.equal(byAddress.archiveTotal, 2);

  const none = await mod.archive.listArchive({ account, search: "requested", limit: 10, offset: 0 });
  assert.equal(none.total, 0, "an unconfirmed sender is not found by searching either");
});

test("pages follow the newest confirmed unsubscribe first, undated last", async () => {
  const first = await mod.archive.listArchive({ account, limit: 1, offset: 0 });
  const second = await mod.archive.listArchive({ account, limit: 1, offset: 1 });
  assert.equal(first.items[0].name, "Kettle");
  assert.equal(second.items[0].name, "legacy");
  assert.equal(first.total, 2);
});

test("one sender can be looked up for review", async () => {
  const one = await mod.archive.listArchive({ account, senderId: ids.kettle, limit: 1, offset: 0 });
  assert.equal(one.items[0]?.senderId, ids.kettle);
  const unconfirmed = await mod.archive.listArchive({ account, senderId: ids.requested, limit: 1, offset: 0 });
  assert.equal(unconfirmed.items.length, 0);
});
