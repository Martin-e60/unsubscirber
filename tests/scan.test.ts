import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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

// Transactions use separate connections; keep the in-memory database shared.
process.env.DATABASE_URL = "file::memory:?cache=shared";
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
let keeper: import("@libsql/client").Client;

before(async () => {
  const { createClient } = await import("@libsql/client");
  keeper = createClient({ url: process.env.DATABASE_URL! });
  const dbModule = await import("../src/db");
  const client = dbModule.db.$client;

  for (const file of fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    const migration = fs.readFileSync(path.join("drizzle", file), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.execute(statement);
    }
  }

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
  mod?.db.$client.close();
  keeper?.close();
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

test("mailto records an unconfirmed request and blocks stale retries", async () => {
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
      sampleMessageId: "request-sample",
    })
    .returning();

  let bodyReads = 0;
  mailbox.provider.getMessageHtml = async () => { bodyReads++; return null; };
  const outcome = await mod.unsubEngine.unsubscribeSender(
    account,
    sender,
    mailbox.provider,
  );

  assert.equal(outcome.status, "REQUESTED");
  assert.match(outcome.detail, /not confirmed/i);
  assert.equal(bodyReads, 0, "a sent request must not fall through to another method");
  assert.equal(outcome.method, "MAILTO");
  assert.equal(mailbox.sent.length, 1);
  assert.equal(mailbox.sent[0].to, "leave@example.com");

  const [updated] = await mod.db
    .select()
    .from(mod.schema.senders)
    .where(eq(mod.schema.senders.id, sender.id));
  assert.equal(updated.status, "REQUESTED");
  assert.ok(updated.decidedAt, "the decision is timestamped");

  const attempts = await mod.db
    .select()
    .from(mod.schema.unsubscribeAttempts)
    .where(eq(mod.schema.unsubscribeAttempts.senderId, sender.id));

  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].status, "SENT");
  assert.equal(attempts[0].method, "MAILTO");

  // Deliberately pass the old ACTIVE object, as a stale browser request would.
  const repeated = await mod.unsubEngine.unsubscribeSender(account, sender, mailbox.provider);
  assert.equal(repeated.status, "REQUESTED");
  assert.equal(repeated.method, null);
  assert.match(repeated.detail, /already been sent/i);
  assert.equal(mailbox.sent.length, 1);

  const { listSenders, countByStatus, toSenderDto } = await import("../src/lib/api/senders");
  const requests = await listSenders({ mailAccountId: account.id, status: "REQUESTED" });
  assert.ok(requests.rows.some((row) => row.id === sender.id));
  assert.equal(toSenderDto(updated).canUnsubscribe, false);
  assert.equal((await countByStatus(account.id)).REQUESTED, requests.total);
  const confirmed = await listSenders({ mailAccountId: account.id, status: "UNSUBSCRIBED" });
  assert.ok(confirmed.rows.every((row) => row.id !== sender.id));
});

test("a rejected unsubscribe email is failed, not recorded as sent", async () => {
  const { eq } = await import("drizzle-orm");
  const mailbox = fakeMailbox([]);
  mailbox.provider.sendMail = async () => { throw new Error("Provider rejected request"); };
  const [sender] = await mod.db.insert(mod.schema.senders).values({
    mailAccountId: account.id, address: "send-failure@example.com",
    unsubscribeMailto: "leave@example.com",
  }).returning();
  const result = await mod.unsubEngine.unsubscribeSender(account, sender, mailbox.provider);
  assert.equal(result.status, "FAILED");
  const [attempt] = await mod.db.select().from(mod.schema.unsubscribeAttempts)
    .where(eq(mod.schema.unsubscribeAttempts.senderId, sender.id));
  assert.equal(attempt.status, "FAILED");
});

test("manual choices cannot reset protected unsubscribe states or cross accounts", async () => {
  const { changeSenderStatus, toSenderDto } = await import("../src/lib/api/senders");
  const { eq } = await import("drizzle-orm");
  for (const status of ["UNSUBSCRIBING", "REQUESTED", "UNSUBSCRIBED"] as const) {
    const [sender] = await mod.db.insert(mod.schema.senders).values({
      mailAccountId: account.id, address: `protected-${status}@example.com`,
      unsubscribeMailto: "leave@example.com", status,
    }).returning();
    assert.equal(toSenderDto(sender).canUnsubscribe, false);
    for (const choice of ["ACTIVE", "KEPT", "ROLLED_UP"] as const) {
      await assert.rejects(changeSenderStatus(account.id, sender.id, choice), { status: 409 });
    }
    await assert.rejects(changeSenderStatus("different-account", sender.id, "ACTIVE"), { status: 404 });
    const [saved] = await mod.db.select().from(mod.schema.senders).where(eq(mod.schema.senders.id, sender.id));
    assert.equal(saved.status, status);
  }
  const [active] = await mod.db.insert(mod.schema.senders).values({
    mailAccountId: account.id, address: "normal-choice@example.com",
  }).returning();
  assert.equal((await changeSenderStatus(account.id, active.id, "KEPT")).status, "KEPT");
  assert.equal((await changeSenderStatus(account.id, active.id, "ACTIVE")).status, "ACTIVE");
  const [restored] = await mod.db.select().from(mod.schema.senders).where(eq(mod.schema.senders.id, active.id));
  assert.equal(restored.decidedAt, null);
});

test("rescanning a requested sender does not confirm removal or enable another send", async () => {
  const address = "pending-rescan@example.com";
  await mod.db.insert(mod.schema.senders).values({
    mailAccountId: account.id, address, status: "REQUESTED", decidedAt: new Date(),
    unsubscribeMailto: "leave@example.com",
  });
  const scan = await mod.scanEngine.startScan(account, 365);
  const mailbox = fakeMailbox([{ messages: [subscription("pending-1", address)], nextPageToken: null }]);
  await mod.scanEngine.runScanStep(account, scan, mailbox.provider);
  const saved = await senderAt(address);
  assert.equal(saved.status, "REQUESTED");
  assert.equal(saved.messageCount, 1);
  assert.equal((await mod.unsubEngine.unsubscribeSender(account, saved, mailbox.provider)).status, "REQUESTED");
  assert.equal(mailbox.sent.length, 0);
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

function subscription(id: string, address: string) {
  return { id, from: address, date: new Date("2026-03-01"),
    listUnsubscribe: "<mailto:leave@example.com>" };
}

async function senderAt(address: string, accountId = account.id) {
  const { and, eq } = await import("drizzle-orm");
  return (await mod.db.select().from(mod.schema.senders).where(and(
    eq(mod.schema.senders.mailAccountId, accountId),
    eq(mod.schema.senders.address, address),
  )))[0];
}

test("rescans count unique IDs and repair legacy totals without changing decisions", async () => {
  const address = "rescan@example.com";
  await mod.db.insert(mod.schema.senders).values({
    mailAccountId: account.id, address, messageCount: 200, status: "UNSUBSCRIBED",
  });
  for (const ids of [["r1", "r2"], ["r1", "r2"], ["r2", "r3"]]) {
    const scan = await mod.scanEngine.startScan(account, 365);
    const mailbox = fakeMailbox([{ messages: ids.map((id) => subscription(id, address)), nextPageToken: null }]);
    const result = await mod.scanEngine.runScanStep(account, scan, mailbox.provider);
    assert.equal(result.status, "DONE");
    assert.equal((await senderAt(address)).messageCount, ids.includes("r3") ? 3 : 2);
    assert.equal((await senderAt(address)).status, "UNSUBSCRIBED");
  }
});

test("duplicate IDs within and across pages never inflate a sender's count", async () => {
  const address = "duplicates@example.com";
  const message = subscription("duplicate-1", address);
  const mailbox = fakeMailbox([
    { messages: [message, message], nextPageToken: "second" },
    { messages: [message, subscription("duplicate-2", address)], nextPageToken: null },
  ]);
  const scan = await mod.scanEngine.startScan(account, 365);
  await mod.scanEngine.runScanStep(account, scan, mailbox.provider);
  const { eq } = await import("drizzle-orm");
  const [reloaded] = await mod.db.select().from(mod.schema.scans).where(eq(mod.schema.scans.id, scan.id));
  assert.equal((await mod.scanEngine.runScanStep(account, reloaded, mailbox.provider)).status, "DONE");
  assert.equal((await senderAt(address)).messageCount, 2);
});

test("retrying a stale finished page returns saved progress without fetching again", async () => {
  const scan = await mod.scanEngine.startScan(account, 365);
  const mailbox = fakeMailbox([{ messages: [subscription("retry-1", "retry@example.com")], nextPageToken: null }]);
  const first = await mod.scanEngine.runScanStep(account, scan, mailbox.provider);
  mailbox.provider.listSubscriptionMessages = async () => { throw new Error("Must not fetch again"); };
  assert.deepEqual(await mod.scanEngine.runScanStep(account, scan, mailbox.provider), first);
  assert.equal((await senderAt("retry@example.com")).messageCount, 1);
});

test("a cancelled in-flight scan cannot add senders or overwrite cancellation", async () => {
  const scan = await mod.scanEngine.startScan(account, 365);
  const mailbox = fakeMailbox([{ messages: [subscription("cancel-1", "cancel@example.com")], nextPageToken: null }]);
  const original = mailbox.provider.listSubscriptionMessages;
  mailbox.provider.listSubscriptionMessages = async (options) => {
    await mod.scanEngine.startScan(account, 90);
    return original(options);
  };
  const result = await mod.scanEngine.runScanStep(account, scan, mailbox.provider);
  assert.equal(result.status, "CANCELLED");
  assert.equal(result.processedMessages, 0);
  assert.equal(await senderAt("cancel@example.com"), undefined);
});

test("a late failed request cannot overwrite a page another request committed", async () => {
  const scan = await mod.scanEngine.startScan(account, 365);
  const fast = fakeMailbox([{ messages: [subscription("late-1", "late@example.com")], nextPageToken: "next" }]);
  const slow = fakeMailbox([]);
  slow.provider.listSubscriptionMessages = async () => {
    await mod.scanEngine.runScanStep(account, scan, fast.provider);
    throw new Error("Late network failure");
  };
  const result = await mod.scanEngine.runScanStep(account, scan, slow.provider);
  assert.equal(result.status, "RUNNING");
  assert.equal(result.processedMessages, 1);
  assert.equal(result.error, null);
});

test("a database failure rolls back sender counts, message IDs and the page cursor", async () => {
  await mod.db.$client.execute(`CREATE TRIGGER fail_scan_message BEFORE INSERT ON scanned_messages
    WHEN NEW.message_id = 'rollback-1' BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
  try {
    const scan = await mod.scanEngine.startScan(account, 365);
    const mailbox = fakeMailbox([{ messages: [subscription("rollback-1", "rollback@example.com")], nextPageToken: "next" }]);
    const result = await mod.scanEngine.runScanStep(account, scan, mailbox.provider);
    assert.equal(result.status, "ERROR");
    assert.equal(result.processedMessages, 0);
    assert.equal(await senderAt("rollback@example.com"), undefined);
    const { eq } = await import("drizzle-orm");
    const [saved] = await mod.db.select().from(mod.schema.scans).where(eq(mod.schema.scans.id, scan.id));
    assert.equal(saved.pageToken, null);
    assert.equal((await mod.db.select().from(mod.schema.scannedMessages)
      .where(eq(mod.schema.scannedMessages.messageId, "rollback-1"))).length, 0);
  } finally {
    await mod.db.$client.execute("DROP TRIGGER fail_scan_message");
  }
});

test("the same provider message ID in another mailbox is counted independently", async () => {
  const [other] = await mod.db.insert(mod.schema.mailAccounts).values({
    userId: account.userId, email: "other@example.com", accessTokenEnc: "x", expiresAt: 0, scope: "test",
  }).returning();
  for (const selected of [account, other]) {
    const scan = await mod.scanEngine.startScan(selected, 365);
    const mailbox = fakeMailbox([{ messages: [subscription("shared-id", "shared@example.com")], nextPageToken: null }]);
    assert.equal((await mod.scanEngine.runScanStep(selected, scan, mailbox.provider)).status, "DONE");
    assert.equal((await senderAt("shared@example.com", selected.id)).messageCount, 1);
  }
  const wrongAccountScan = await mod.scanEngine.startScan(other, 365);
  await assert.rejects(mod.scanEngine.runScanStep(account, wrongAccountScan, fakeMailbox([]).provider), /Scan not found/);
});

test("simultaneous requests for one page commit one result", async () => {
  const scan = await mod.scanEngine.startScan(account, 365);
  const mailbox = fakeMailbox([{ messages: [subscription("parallel-1", "parallel@example.com")], nextPageToken: null }]);
  const page = await mailbox.provider.listSubscriptionMessages({ lookbackDays: 365, pageToken: null, pageSize: 100 });
  mailbox.provider.listSubscriptionMessages = async () => page;
  const results = await Promise.all([
    mod.scanEngine.runScanStep(account, scan, mailbox.provider),
    mod.scanEngine.runScanStep(account, scan, mailbox.provider),
  ]);
  assert.ok(results.some((result) => result.status === "DONE"));
  assert.ok(results.every((result) => result.status !== "ERROR"));
  assert.equal((await senderAt("parallel@example.com")).messageCount, 1);
  const { eq } = await import("drizzle-orm");
  const [saved] = await mod.db.select().from(mod.schema.scans).where(eq(mod.schema.scans.id, scan.id));
  assert.equal(saved.processedMessages, 1);
  assert.equal(saved.status, "DONE");
});

test("simultaneous scan starts leave only one running scan for the mailbox", async () => {
  await Promise.all([
    mod.scanEngine.startScan(account, 90),
    mod.scanEngine.startScan(account, 365),
  ]);
  const { and, eq } = await import("drizzle-orm");
  const running = await mod.db.select().from(mod.schema.scans).where(and(
    eq(mod.schema.scans.mailAccountId, account.id), eq(mod.schema.scans.status, "RUNNING"),
  ));
  assert.equal(running.length, 1);
});

test("two unsubscribes at once email the sender only once", async () => {
  const { eq } = await import("drizzle-orm");
  const mailbox = fakeMailbox([]);

  const [sender] = await mod.db
    .insert(mod.schema.senders)
    .values({
      mailAccountId: account.id,
      address: "race@example.com",
      name: "Race List",
      messageCount: 3,
      unsubscribeMailto: "leave@race.example.com",
    })
    .returning();

  // What a double click looks like, or a row that is also part of a bulk
  // selection: two requests for the same sender, in flight together.
  const outcomes = await Promise.all([
    mod.unsubEngine.unsubscribeSender(account, sender, mailbox.provider),
    mod.unsubEngine.unsubscribeSender(account, sender, mailbox.provider),
  ]);

  assert.equal(
    mailbox.sent.length,
    1,
    "the sender must receive one unsubscribe email, not two",
  );

  const attempts = await mod.db
    .select()
    .from(mod.schema.unsubscribeAttempts)
    .where(eq(mod.schema.unsubscribeAttempts.senderId, sender.id));

  assert.equal(attempts.length, 1, "one attempt recorded, not two");

  // One call did the work; the other reported what was already happening.
  assert.equal(outcomes.filter((o) => o.method === "MAILTO").length, 1);
  assert.equal(outcomes.filter((o) => o.method === null).length, 1);
});

test("unsubscribing again from a finished sender sends nothing", async () => {
  const mailbox = fakeMailbox([]);

  const [sender] = await mod.db
    .insert(mod.schema.senders)
    .values({
      mailAccountId: account.id,
      address: "done@example.com",
      name: "Done List",
      messageCount: 2,
      unsubscribeMailto: "leave@done.example.com",
      status: "UNSUBSCRIBED",
      decidedAt: new Date(),
    })
    .returning();

  const outcome = await mod.unsubEngine.unsubscribeSender(
    account,
    sender,
    mailbox.provider,
  );

  assert.equal(mailbox.sent.length, 0, "a finished sender is never emailed again");
  assert.equal(outcome.status, "UNSUBSCRIBED");
  assert.match(outcome.detail, /already unsubscribed/i);
});
