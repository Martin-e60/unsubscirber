/**
 * Fills the database with a realistic mailbox so the whole UI can be looked at
 * without connecting a real Gmail account.
 *
 * This is the fastest way to see every state a design has to cover: senders
 * that are subscribed, kept, rolled up, unsubscribed, failed, and the awkward
 * "needs a click" case, plus a history of attempts.
 *
 *   npm run db:push     (once, to create the tables)
 *   npm run db:seed
 *   npm run dev         then sign in — or point the browser at the seeded user
 *
 * Running it again replaces the seeded data rather than duplicating it.
 */

import fs from "node:fs";
import path from "node:path";

// A standalone script does not get Next's automatic .env loading.
loadEnvFile(path.resolve(process.cwd(), ".env"));

const { db } = await import("../src/db/index.ts");
const schema = await import("../src/db/schema.ts");
const { encrypt } = await import("../src/lib/crypto.ts");
const { eq } = await import("drizzle-orm");
const { DEV_USER_EMAIL, DEV_USER_NAME } = await import("../src/lib/constants.ts");

const SEED_EMAIL = DEV_USER_EMAIL;
const DAY = 86_400_000;

/** name, address, emails, days since last email, subject, status, has https link */
const SENDERS: [string, string, number, number, string, string, boolean][] = [
  ["AliExpress", "news@aliexpress.com", 93, 210, "Your 11.11 deals end tonight", "ACTIVE", true],
  ["LinkedIn", "notify@linkedin.com", 72, 12, "You appeared in 9 searches", "ACTIVE", true],
  ["Notion", "team@makenotion.com", 36, 40, "What's new in Notion this month", "ACTIVE", true],
  ["Figma", "news@figma.com", 28, 6, "Config 2026 tickets are live", "ACTIVE", true],
  ["Duolingo", "hello@duolingo.com", 61, 2, "You're on a 3 day streak!", "ACTIVE", false],
  ["Steam", "noreply@steampowered.com", 19, 21, "Autumn Sale starts now", "ACTIVE", true],
  ["Medium Daily", "noreply@medium.com", 44, 90, "Today's highlights for you", "MANUAL", true],
  ["Uber Eats", "no-reply@ubereats.com", 51, 15, "50% off your next order", "UNSUBSCRIBED", true],
  ["Spotify", "no-reply@spotify.com", 22, 30, "Your 2025 Wrapped is here", "UNSUBSCRIBED", true],
  ["GitHub", "noreply@github.com", 140, 1, "[your-repo] CI passed", "KEPT", true],
  ["Vercel", "ship@vercel.com", 17, 9, "Changelog: faster builds", "ROLLED_UP", true],
  ["Product Hunt", "hello@producthunt.com", 33, 4, "Today's top 5 products", "ROLLED_UP", true],
  ["Booking.com", "news@booking.com", 47, 120, "Deals in Sofia this weekend", "FAILED", false],
];

// Deleting the user cascades to the mailbox, its senders and their attempts.
await db.delete(schema.users).where(eq(schema.users.email, SEED_EMAIL));

const [user] = await db
  .insert(schema.users)
  .values({ email: SEED_EMAIL, name: DEV_USER_NAME })
  .returning();

const [account] = await db
  .insert(schema.mailAccounts)
  .values({
    userId: user.id,
    provider: "gmail",
    email: SEED_EMAIL,
    // Not real tokens — anything touching Gmail will fail, which is expected.
    accessTokenEnc: encrypt("seed-access-token"),
    refreshTokenEnc: encrypt("seed-refresh-token"),
    expiresAt: Date.now() + 3_600_000,
    scope: "seed",
  })
  .returning();

const decided = new Set(["UNSUBSCRIBED", "KEPT", "ROLLED_UP"]);
let firstSenderId = "";

for (const [name, address, count, daysAgo, subject, status, hasLink] of SENDERS) {
  const [row] = await db
    .insert(schema.senders)
    .values({
      mailAccountId: account.id,
      address,
      name,
      messageCount: count,
      firstSeenAt: new Date(Date.now() - 300 * DAY),
      lastSeenAt: new Date(Date.now() - daysAgo * DAY),
      sampleSubject: subject,
      sampleMessageId: "seed",
      unsubscribeHttp: hasLink ? `https://example.com/u/${address}` : null,
      unsubscribeMailto: `unsubscribe@${address.split("@")[1]}`,
      oneClick: hasLink,
      status: status as never,
      decidedAt: decided.has(status) ? new Date(Date.now() - 5 * DAY) : null,
    })
    .returning();

  firstSenderId ||= row.id;
}

// One sender with a full attempt trail, so the history screen has something
// to show — including the failures, which are the interesting case.
await db.insert(schema.unsubscribeAttempts).values([
  {
    senderId: firstSenderId,
    method: "ONE_CLICK",
    status: "SUCCESS",
    detail: "One-click unsubscribe accepted (HTTP 200).",
  },
  {
    senderId: firstSenderId,
    method: "HTTP",
    status: "MANUAL_REQUIRED",
    detail: "https://example.com/u/confirm",
  },
  {
    senderId: firstSenderId,
    method: "MAILTO",
    status: "FAILED",
    detail: "Gmail API 403 on /messages/send",
  },
]);

console.log(
  `Seeded ${SENDERS.length} senders for ${SEED_EMAIL}.\n` +
    "Run `npm run dev`, then use \"Skip sign-in\" on the landing page.",
);

/** Minimal .env reader: KEY="value" per line, # for comments. */
function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) {
    throw new Error(`No .env found at ${file}. Copy .env.example to .env first.`);
  }
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}
