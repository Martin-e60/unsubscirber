import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Keeping, end to end against a real SQLite database: a kept sender survives
 * rescans of any window, and moving it back to review changes that decision
 * and nothing else.
 */

process.env.DATABASE_URL = "file::memory:?cache=shared";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
process.env.SESSION_SECRET = Buffer.alloc(32, 2).toString("base64");

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

type Mod = {
  db: typeof import("../src/db")["db"];
  schema: typeof import("../src/db/schema");
  scan: typeof import("../src/lib/scan/engine");
  senders: typeof import("../src/lib/api/senders");
};
let mod: Mod;
let account: import("../src/db/schema").MailAccount;
let keeper: import("@libsql/client").Client;
let keptId: string;

function mailbox(messages: Partial<import("../src/lib/mail/provider").MessageHeaders>[]) {
  const calls = { list: 0, sent: 0, bodies: 0 };
  return {
    calls,
    provider: {
      name: "fake",
      address: "sam@example.com",
      async listSubscriptionMessages() {
        calls.list++;
        return {
          messages: messages.map((m, i) => ({
            id: m.id ?? `m${i}`,
            from: m.from ?? null,
            subject: m.subject ?? null,
            date: m.date ?? null,
            listUnsubscribe: m.listUnsubscribe ?? null,
            listUnsubscribePost: null,
            listId: null,
            precedence: null,
          })),
          nextPageToken: null,
          totalEstimate: messages.length,
        };
      },
      async getMessageHtml() {
        calls.bodies++;
        return null;
      },
      async sendMail() {
        calls.sent++;
      },
    } as import("../src/lib/mail/provider").MailProvider,
  };
}

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
    senders: await import("../src/lib/api/senders"),
  };
  const { db, schema } = mod;
  const [user] = await db.insert(schema.users).values({ email: "sam@example.com" }).returning();
  [account] = await db.insert(schema.mailAccounts).values({
    userId: user.id, provider: "gmail", email: "sam@example.com",
    accessTokenEnc: "x", expiresAt: Date.now() + 3_600_000, scope: "test",
  }).returning();

  // Seen by an earlier, longer scan: three messages from forty days ago.
  const box = mailbox([1, 2, 3].map((n) => ({
    id: `old${n}`, from: "Field Notes <hello@fieldnotes.example>", subject: `Issue ${n}`,
    date: ago(40 + n), listUnsubscribe: "<https://fieldnotes.example/u>",
  })));
  const scan = await mod.scan.startScan(account, 90);
  await mod.scan.runScanStep(account, scan, box.provider);

  const { eq } = await import("drizzle-orm");
  const [sender] = await db.select().from(schema.senders).where(eq(schema.senders.address, "hello@fieldnotes.example"));
  keptId = sender.id;
  await mod.senders.changeSenderStatus(account.id, keptId, "KEPT");
});

after(() => {
  mod?.db.$client.close();
  keeper?.close();
});

async function sender() {
  const { eq } = await import("drizzle-orm");
  const [row] = await mod.db.select().from(mod.schema.senders).where(eq(mod.schema.senders.id, keptId));
  return row;
}

test("a kept sender stays kept, with its history, after a scan of a window it is not in", async () => {
  const box = mailbox([{ id: "other1", from: "Other <news@other.example>", date: ago(2),
    listUnsubscribe: "<https://other.example/u>" }]);
  const scan = await mod.scan.startScan(account, 30);
  await mod.scan.runScanStep(account, scan, box.provider);

  const row = await sender();
  assert.equal(row.status, "KEPT");
  assert.equal(row.messageCount, 3, "no mail in this window does not mean it never wrote");

  const { rows } = await mod.senders.listSenders({ mailAccountId: account.id, status: "KEPT" });
  assert.deepEqual(rows.map((r) => r.id), [keptId], "and it is still listed in Keeping");
});

test("new mail from a kept sender updates its figures but not the decision", async () => {
  const box = mailbox([{ id: "new1", from: "Field Notes <hello@fieldnotes.example>", subject: "Weekend reads",
    date: ago(1), listUnsubscribe: "<https://fieldnotes.example/u>" }]);
  const scan = await mod.scan.startScan(account, 30);
  await mod.scan.runScanStep(account, scan, box.provider);

  const row = await sender();
  assert.equal(row.status, "KEPT");
  assert.equal(row.messageCount, 4);
  assert.equal(row.sampleSubject, "Weekend reads");
});

test("moving to review changes the decision only", async () => {
  const { eq } = await import("drizzle-orm");
  const messagesBefore = await mod.db.select().from(mod.schema.scannedMessages)
    .where(eq(mod.schema.scannedMessages.senderId, keptId));
  const attemptsBefore = await mod.db.select().from(mod.schema.unsubscribeAttempts)
    .where(eq(mod.schema.unsubscribeAttempts.senderId, keptId));

  const dto = await mod.senders.changeSenderStatus(account.id, keptId, "ACTIVE");
  assert.equal(dto.status, "ACTIVE");

  const row = await sender();
  assert.equal(row.status, "ACTIVE");
  assert.equal(row.decidedAt, null, "back to undecided");
  assert.equal(row.messageCount, 4, "its history is untouched");

  const messagesAfter = await mod.db.select().from(mod.schema.scannedMessages)
    .where(eq(mod.schema.scannedMessages.senderId, keptId));
  const attemptsAfter = await mod.db.select().from(mod.schema.unsubscribeAttempts)
    .where(eq(mod.schema.unsubscribeAttempts.senderId, keptId));
  assert.equal(messagesAfter.length, messagesBefore.length);
  assert.equal(attemptsAfter.length, attemptsBefore.length, "no unsubscribe attempt is made or recorded");

  const counts = await mod.senders.countByStatus(account.id);
  assert.equal(counts.KEPT, 0);
  assert.ok(counts.ACTIVE >= 1);
});

test("keeping again and moving back can repeat without drift", async () => {
  for (let round = 0; round < 3; round++) {
    await mod.senders.changeSenderStatus(account.id, keptId, "KEPT");
    assert.equal((await sender()).status, "KEPT");
    await mod.senders.changeSenderStatus(account.id, keptId, "ACTIVE");
    assert.equal((await sender()).status, "ACTIVE");
  }
});

test("a confirmed unsubscribe cannot be moved to review", async () => {
  const [confirmed] = await mod.db.insert(mod.schema.senders).values({
    mailAccountId: account.id, address: "gone@example.org", status: "UNSUBSCRIBED", decidedAt: ago(3),
  }).returning();
  await assert.rejects(
    mod.senders.changeSenderStatus(account.id, confirmed.id, "ACTIVE"),
    /already in progress or has been sent/,
  );
});
