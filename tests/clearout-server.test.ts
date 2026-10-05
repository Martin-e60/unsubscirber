import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Clear out on the server, against a real SQLite database: History belongs to
 * one mailbox, counts only what Gmail confirmed, and "From unsubscribed"
 * reads the list identity Cleanup recorded.
 */

process.env.DATABASE_URL = "file::memory:";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.SESSION_SECRET = Buffer.alloc(32, 8).toString("base64");

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

let db: typeof import("../src/db")["db"];
let schema: typeof import("../src/db/schema");
let server: typeof import("../src/lib/clearout/server");
let constants: typeof import("../src/lib/constants");
let sam: import("../src/db/schema").MailAccount;
let alex: import("../src/db/schema").MailAccount;

before(async () => {
  ({ db } = await import("../src/db"));
  schema = await import("../src/db/schema");
  server = await import("../src/lib/clearout/server");
  constants = await import("../src/lib/constants");
  for (const file of fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    for (const sql of fs.readFileSync(path.join("drizzle", file), "utf8").split("--> statement-breakpoint")) {
      if (sql.trim()) await db.$client.execute(sql);
    }
  }

  const account = async (email: string, scope: string) => {
    const [user] = await db.insert(schema.users).values({ email }).returning();
    const [row] = await db
      .insert(schema.mailAccounts)
      .values({ userId: user.id, provider: "gmail", email, accessTokenEnc: "x", expiresAt: Date.now() + 3_600_000, scope })
      .returning();
    return row;
  };
  sam = await account("sam@example.com", constants.GOOGLE_SCOPES.join(" "));
  alex = await account("alex@example.com", `${constants.GOOGLE_SCOPES.join(" ")} ${constants.GMAIL_MODIFY_SCOPE}`);
});

after(() => db?.$client.close());

test("organising needs the modify grant; reading does not", () => {
  assert.deepEqual(server.accessFor(sam), {
    canRead: true,
    canOrganise: false,
    // A reconnect for this very mailbox, by id, that returns to Clear out.
    grantUrl: `/api/auth/google/start?mode=reconnect&mailbox=${sam.id}&access=organise&next=%2Fclear-out`,
  });
  assert.throws(() => server.requireOrganise(sam), (error: Error & { status?: number }) => error.status === 403);
  assert.doesNotThrow(() => server.requireRead(sam));
  assert.deepEqual(server.accessFor(alex), { canRead: true, canOrganise: true, grantUrl: null });
});

test("History belongs to one mailbox: another account cannot see or add to it", async () => {
  const run = await server.createRun(alex.id, { action: "archive", requested: 12, labelId: null, labelName: null });

  assert.equal(await server.findRun(sam.id, run.id), null, "Sam cannot load Alex's action");
  assert.ok(await server.findRun(alex.id, run.id));

  const samHistory = await server.listRuns(sam.id);
  assert.ok(!samHistory.some((row) => row.id === run.id), "nor see it in History");
  assert.equal((await server.listRuns(alex.id))[0].id, run.id);
});

test("History counts confirmed outcomes, and a retry moves failures to done", async () => {
  let run = await server.createRun(alex.id, { action: "trash", requested: 12, labelId: null, labelName: null });
  run = await server.recordChunk(run, { succeeded: 8, failed: 2, retry: false });
  assert.deepEqual([run.succeeded, run.failed], [8, 2]);

  run = await server.recordChunk(run, { succeeded: 1, failed: 1, retry: true });
  assert.deepEqual([run.succeeded, run.failed], [9, 1], "one retried success, one still failing");

  run = await server.recordChunk(run, { succeeded: 50, failed: 50, retry: false });
  assert.ok(run.succeeded <= run.requested && run.succeeded + run.failed <= run.requested, "never more than reviewed");

  const dto = server.toRunDto(run);
  assert.equal(dto.requested, 12);
  assert.ok(!("mailAccountId" in dto), "the mailbox id is not sent to the browser");
});

test("From unsubscribed uses the exact address and the List-Ids seen up to the unsubscribe", async () => {
  const [kettle] = await db
    .insert(schema.senders)
    .values({ mailAccountId: alex.id, address: "news@kettle.example", name: "Kettle", status: "UNSUBSCRIBED", decidedAt: ago(10) })
    .returning();
  const [plain] = await db
    .insert(schema.senders)
    .values({ mailAccountId: alex.id, address: "deals@shop.example", status: "UNSUBSCRIBED", decidedAt: ago(3) })
    .returning();
  await db.insert(schema.senders).values({ mailAccountId: alex.id, address: "kept@list.example", status: "KEPT" });
  await db.insert(schema.senders).values({ mailAccountId: sam.id, address: "sams@list.example", status: "UNSUBSCRIBED" });

  await db.insert(schema.scannedMessages).values([
    { mailAccountId: alex.id, messageId: "k1", senderId: kettle.id, receivedAt: ago(20), listId: "Kettle Weekly <weekly.kettle.example>" },
    // After the unsubscribe, a different list from the same address: not the one that was left.
    { mailAccountId: alex.id, messageId: "k2", senderId: kettle.id, receivedAt: ago(2), listId: "<orders.kettle.example>" },
    { mailAccountId: alex.id, messageId: "p1", senderId: plain.id, receivedAt: ago(5), listId: null },
  ]);

  const lists = await server.unsubscribedLists(alex.id);
  assert.deepEqual(
    lists.sort((a, b) => a.address.localeCompare(b.address)),
    [
      { address: "deals@shop.example", listIds: [] },
      { address: "news@kettle.example", listIds: ["weekly.kettle.example"] },
    ],
    "kept senders and other people's unsubscribes are not included",
  );
});
