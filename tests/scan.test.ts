import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Integration tests for the scan and unsubscribe engines, against a real
 * SQLite database and a fake mailbox.
 *
 * The upsert that merges senders across pages is the single most error-prone
 * piece of SQL in the project — counts must accumulate, the newest subject
 * must win, an unsubscribe method must never be lost, and a decision the user
 * already made must never be reset by a later scan. That is what this file
 * pins down.
 */

const dbFile = path.join(os.tmpdir(), `unsub-test-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.SESSION_SECRET = Buffer.alloc(32, 9).toString("base64");

// Imported dynamically so DATABASE_URL is set before the connection is opened.
type Mod = {
  db: typeof import("../src/db")["db"];
  schema: typeof import("../src/db/schema");
  scanEngine: typeof import("../src/lib/scan/engine");
  unsubEngine: typeof import("../src/lib/unsubscribe/engine");
};
let mod: Mod;
let account: import("../src/db/schema").MailAccount;

before(async () => {
  const { createClient } = await import("@libsql/client");
  const client = createClient({ url: `file:${dbFile}` });

  const migration = fs.readFileSync(
    path.join(
      "drizzle",
      fs.readdirSync("drizzle").find((f) => f.endsWith(".sql"))!,
    ),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.execute(statement);
  }

  const dbModule = await import("../src/db");
  const schema = await import("../src/db/schema");

  mod = {
    db: dbModule.db,
    schema,
    scanEngine: await import("../src/lib/scan/engine"),
    unsubEngine: await import("../src/lib/unsubscribe/engine"),
  };

  const [user] = await mod.db
    .insert(schema.users)
    .values({ email: "martin@example.com" })
    .returning();

  [account] = await mod.db
    .insert(schema.mailAccounts)
    .values({
      userId: user.id,
      provider: "gmail",
      email: "martin@example.com",
      accessTokenEnc: "x",
      refreshTokenEnc: null,
      expiresAt: Date.now() + 3_600_000,
      scope: "test",
    })
    .returning();
});

after(() => {
  fs.rmSync(dbFile, { force: true });
});

/** A mailbox that returns whatever pages the test hands it. */
function fakeMailbox(pages: {
  messages: Partial<import("../src/lib/mail/provider").MessageHeaders>[];
  nextPageToken: string | null;
}[]) {
  let call = 0;
  const sent: { to: string; subject: string }[] = [];

  return {
    sent,
    provider: {
      name: "fake",
      address: "martin@example.com",
      async listSubscriptionMessages() {
        const page = pages[call++] ?? { messages: [], nextPageToken: null };
        return {
          messages: page.messages.map((m, i) => ({
            id: m.id ?? `m${call}-${i}`,
            from: m.from ?? null,
            subject: m.subject ?? null,
            date: m.date ?? null,
            listUnsubscribe: m.listUnsubscribe ?? null,
            listUnsubscribePost: m.listUnsubscribePost ?? null,
            listId: m.listId ?? null,
            precedence: m.precedence ?? null,
          })),
          nextPageToken: page.nextPageToken,
          totalEstimate: 4,
        };
      },
      async getMessageHtml() {
        return '<a href="https://example.com/u/9">Unsubscribe</a>';
      },
      async sendMail(options: { to: string; subject: string }) {
        sent.push(options);
      },
    } as import("../src/lib/mail/provider").MailProvider,
  };
}

test("a scan groups messages into senders and accumulates across pages", async () => {
  const older = new Date("2026-01-10T09:00:00Z");
  const newer = new Date("2026-02-20T09:00:00Z");

  const mailbox = fakeMailbox([
    {
      messages: [
        {
          id: "a1",
          from: "Figma <news@figma.com>",
          subject: "Old Figma news",
          date: older,
          listUnsubscribe: "<mailto:un@figma.com>",
        },
        {
          id: "a2",
          from: "Figma <news@figma.com>",
          subject: "Another Figma email",
          date: older,
          listUnsubscribe: "<mailto:un@figma.com>",
        },
        {
          id: "a3",
          from: "Vercel <ship@vercel.com>",
          subject: "Ship update",
          date: older,
          listUnsubscribe: "<https://vercel.com/u?id=1>",
          listUnsubscribePost: "List-Unsubscribe=One-Click",
        },
        // Personal mail: no list headers at all, must be ignored.
        { id: "a4", from: "Mum <mum@example.com>", subject: "Call me", date: older },
      ],
      nextPageToken: "page-2",
    },
    {
      messages: [
        {
          id: "b1",
          from: "Figma <news@figma.com>",
          subject: "Newest Figma email",
          date: newer,
          // This page also reveals an https target the first page did not have.
          listUnsubscribe: "<https://figma.com/u?id=7>, <mailto:un@figma.com>",
        },
      ],
      nextPageToken: null,
    },
  ]);

  const scan = await mod.scanEngine.startScan(account, 365);

  const first = await mod.scanEngine.runScanStep(account, scan, mailbox.provider);
  assert.equal(first.done, false, "more pages remain");
  assert.equal(first.processedMessages, 4);
  assert.equal(first.matchedMessages, 3, "personal mail is not a subscription");
  assert.equal(first.foundSenders, 2);

  const { eq, and } = await import("drizzle-orm");
  const [reloaded] = await mod.db
    .select()
    .from(mod.schema.scans)
    .where(eq(mod.schema.scans.id, scan.id));

  const second = await mod.scanEngine.runScanStep(
    account,
    reloaded,
    mailbox.provider,
  );
  assert.equal(second.done, true);
  assert.equal(second.status, "DONE");
  assert.equal(second.processedMessages, 5);

  const [figma] = await mod.db
    .select()
    .from(mod.schema.senders)
    .where(
      and(
        eq(mod.schema.senders.mailAccountId, account.id),
        eq(mod.schema.senders.address, "news@figma.com"),
      ),
    );

  assert.equal(figma.messageCount, 3, "counts accumulate across pages");
  assert.equal(figma.name, "Figma");
  assert.equal(
    figma.sampleSubject,
    "Newest Figma email",
    "the newest message supplies the preview subject",
  );
  assert.equal(
    figma.unsubscribeMailto,
    "un@figma.com",
    "an unsubscribe method found on page one is not lost",
  );
  assert.equal(
    figma.unsubscribeHttp,
    "https://figma.com/u?id=7",
    "a method discovered later is added",
  );
  assert.equal(figma.lastSeenAt?.getTime(), newer.getTime());
  assert.equal(figma.firstSeenAt?.getTime(), older.getTime());

  const [vercel] = await mod.db
    .select()
    .from(mod.schema.senders)
    .where(
      and(
        eq(mod.schema.senders.mailAccountId, account.id),
        eq(mod.schema.senders.address, "ship@vercel.com"),
      ),
    );
  assert.equal(vercel.oneClick, true, "RFC 8058 one-click is recorded");
});

test("a later scan never overwrites a decision the user already made", async () => {
  const { eq, and } = await import("drizzle-orm");

  await mod.db
    .update(mod.schema.senders)
    .set({ status: "KEPT" })
    .where(
      and(
        eq(mod.schema.senders.mailAccountId, account.id),
        eq(mod.schema.senders.address, "news@figma.com"),
      ),
    );

  const mailbox = fakeMailbox([
    {
      messages: [
        {
          id: "c1",
          from: "Figma <news@figma.com>",
          subject: "Yet another",
          date: new Date("2026-03-01T09:00:00Z"),
          listUnsubscribe: "<mailto:un@figma.com>",
        },
      ],
      nextPageToken: null,
    },
  ]);

  const scan = await mod.scanEngine.startScan(account, 365);
  await mod.scanEngine.runScanStep(account, scan, mailbox.provider);

  const [figma] = await mod.db
    .select()
    .from(mod.schema.senders)
    .where(
      and(
        eq(mod.schema.senders.mailAccountId, account.id),
        eq(mod.schema.senders.address, "news@figma.com"),
      ),
    );

  assert.equal(figma.status, "KEPT", "the user's choice survives a rescan");
  assert.equal(figma.messageCount, 4, "but the count still updates");
});

test("starting a scan cancels the one already running", async () => {
  const { eq } = await import("drizzle-orm");

  const first = await mod.scanEngine.startScan(account, 90);
  const second = await mod.scanEngine.startScan(account, 90);

  const [old] = await mod.db
    .select()
    .from(mod.schema.scans)
    .where(eq(mod.schema.scans.id, first.id));

  assert.equal(old.status, "CANCELLED");
  assert.equal(second.status, "RUNNING");
});

test("unsubscribing by mailto sends the email and records the attempt", async () => {
  const { eq } = await import("drizzle-orm");
  const mailbox = fakeMailbox([]);

  const [sender] = await mod.db
    .insert(mod.schema.senders)
    .values({
      mailAccountId: account.id,
      address: "list@example.com",
      name: "Example List",
      messageCount: 5,
      unsubscribeMailto: "leave@example.com",
    })
    .returning();

  const outcome = await mod.unsubEngine.unsubscribeSender(
    account,
    sender,
    mailbox.provider,
  );

  assert.equal(outcome.status, "UNSUBSCRIBED");
  assert.equal(outcome.method, "MAILTO");
  assert.equal(mailbox.sent.length, 1);
  assert.equal(mailbox.sent[0].to, "leave@example.com");

  const [updated] = await mod.db
    .select()
    .from(mod.schema.senders)
    .where(eq(mod.schema.senders.id, sender.id));
  assert.equal(updated.status, "UNSUBSCRIBED");
  assert.ok(updated.decidedAt, "the decision is timestamped");

  const attempts = await mod.db
    .select()
    .from(mod.schema.unsubscribeAttempts)
    .where(eq(mod.schema.unsubscribeAttempts.senderId, sender.id));

  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].status, "SUCCESS");
  assert.equal(attempts[0].method, "MAILTO");
});

test("a sender with no unsubscribe method at all fails cleanly", async () => {
  const mailbox = fakeMailbox([]);

  const [sender] = await mod.db
    .insert(mod.schema.senders)
    .values({
      mailAccountId: account.id,
      address: "nothing@example.com",
      messageCount: 1,
    })
    .returning();

  const outcome = await mod.unsubEngine.unsubscribeSender(
    account,
    sender,
    mailbox.provider,
  );

  assert.equal(outcome.status, "FAILED");
  assert.match(outcome.detail, /no unsubscribe method/i);
});
