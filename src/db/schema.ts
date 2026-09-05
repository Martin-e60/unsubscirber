import { sql, relations } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";

/**
 * Database schema.
 *
 * This file IS the schema — there is no code generation step. Change a column
 * here, run `npm run db:push`, and both the database and the TypeScript types
 * update together.
 *
 * SQLite has no enum type, so status columns are text. The allowed values live
 * in src/lib/constants.ts and are enforced by the `$type<>()` annotations below.
 */

import type {
  SenderStatus,
  ScanStatus,
  UnsubscribeMethod,
  AttemptStatus,
} from "@/lib/constants";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

/** A person using the app. */
export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  passwordHash: text("password_hash"),
  googleSub: text("google_sub").unique(),
  createdAt: createdAt(),
});

/** Persistent counters for password authentication; keys contain hashed emails. */
export const authAttempts = sqliteTable("auth_attempts", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

/**
 * One connected mailbox.
 *
 * Today this is always Gmail, but nothing above this layer knows that — see
 * src/lib/mail/provider.ts. Adding Outlook means adding a row with
 * provider: "outlook" and a second MailProvider implementation.
 */
export const mailAccounts = sqliteTable(
  "mail_accounts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("gmail"),
    email: text("email").notNull(),

    /** OAuth tokens, AES-256-GCM encrypted at rest. See src/lib/crypto.ts. */
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    /** Access token expiry, epoch milliseconds. */
    expiresAt: integer("expires_at").notNull(),
    scope: text("scope").notNull(),

    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("mail_accounts_user_provider_email")
      .on(t.userId, t.provider, t.email),
    index("mail_accounts_user_idx").on(t.userId),
  ],
);

/**
 * A mailbox scan.
 *
 * Scans run in small resumable chunks driven by the browser rather than as one
 * long server job. That keeps every request well under any serverless timeout,
 * gives an honest progress bar, and lets a scan survive a page refresh.
 * `pageToken` is the provider's cursor for the next chunk.
 */
export const scans = sqliteTable(
  "scans",
  {
    id: id(),
    mailAccountId: text("mail_account_id")
      .notNull()
      .references(() => mailAccounts.id, { onDelete: "cascade" }),
    status: text("status").$type<ScanStatus>().notNull().default("RUNNING"),
    /** How far back in the mailbox this scan looks. */
    lookbackDays: integer("lookback_days").notNull().default(365),
    /** Provider cursor for the next chunk. Null once the mailbox is exhausted. */
    pageToken: text("page_token"),

    processedMessages: integer("processed_messages").notNull().default(0),
    matchedMessages: integer("matched_messages").notNull().default(0),
    foundSenders: integer("found_senders").notNull().default(0),
    /** Provider's estimate of total matching messages, for the progress bar. */
    totalEstimate: integer("total_estimate").notNull().default(0),

    error: text("error"),
    startedAt: createdAt(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("scans_account_status_idx").on(t.mailAccountId, t.status)],
);

/**
 * A subscription: every message from one sending address collapsed into a
 * single row, with the unsubscribe methods discovered along the way.
 */
export const senders = sqliteTable(
  "senders",
  {
    id: id(),
    mailAccountId: text("mail_account_id")
      .notNull()
      .references(() => mailAccounts.id, { onDelete: "cascade" }),

    /** Normalised lowercase sending address, e.g. "news@figma.com". */
    address: text("address").notNull(),
    /** Display name from the From header, e.g. "Figma". */
    name: text("name"),

    messageCount: integer("message_count").notNull().default(0),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),

    /** A recent subject and its message id, so the UI can show a preview. */
    sampleSubject: text("sample_subject"),
    sampleMessageId: text("sample_message_id"),

    /** Unsubscribe methods parsed from the List-Unsubscribe header. */
    unsubscribeHttp: text("unsubscribe_http"),
    unsubscribeMailto: text("unsubscribe_mailto"),
    /**
     * True when the sender advertises RFC 8058 one-click unsubscribe, which we
     * can complete with a single POST and no user interaction at all.
     */
    oneClick: integer("one_click", { mode: "boolean" }).notNull().default(false),

    status: text("status").$type<SenderStatus>().notNull().default("ACTIVE"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),

    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("senders_account_address").on(t.mailAccountId, t.address),
    index("senders_account_status_idx").on(t.mailAccountId, t.status),
    index("senders_account_count_idx").on(t.mailAccountId, t.messageCount),
  ],
);

/**
 * Unique subscription message IDs per mailbox. No message bodies are stored.
 * Records survive rescans and disappear when the mailbox/sender is deleted.
 */
export const scannedMessages = sqliteTable(
  "scanned_messages",
  {
    mailAccountId: text("mail_account_id").notNull()
      .references(() => mailAccounts.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    senderId: text("sender_id").notNull()
      .references(() => senders.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.mailAccountId, t.messageId] }),
    index("scanned_messages_sender_idx").on(t.senderId),
  ],
);

/** Audit trail of successful, failed, and manual unsubscribe attempts. */
export const unsubscribeAttempts = sqliteTable(
  "unsubscribe_attempts",
  {
    id: id(),
    senderId: text("sender_id")
      .notNull()
      .references(() => senders.id, { onDelete: "cascade" }),
    method: text("method").$type<UnsubscribeMethod>().notNull(),
    status: text("status").$type<AttemptStatus>().notNull(),
    /** Human readable outcome, e.g. "HTTP 200" or the URL to open manually. */
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (t) => [
    index("attempts_sender_idx").on(t.senderId),
    index("attempts_created_idx").on(t.createdAt),
  ],
);

// --- Relations (used by drizzle's query API) --------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  mailAccounts: many(mailAccounts),
}));

export const mailAccountsRelations = relations(mailAccounts, ({ one, many }) => ({
  user: one(users, { fields: [mailAccounts.userId], references: [users.id] }),
  senders: many(senders),
  scans: many(scans),
}));

export const scansRelations = relations(scans, ({ one }) => ({
  mailAccount: one(mailAccounts, {
    fields: [scans.mailAccountId],
    references: [mailAccounts.id],
  }),
}));

export const sendersRelations = relations(senders, ({ one, many }) => ({
  mailAccount: one(mailAccounts, {
    fields: [senders.mailAccountId],
    references: [mailAccounts.id],
  }),
  attempts: many(unsubscribeAttempts),
}));

export const attemptsRelations = relations(unsubscribeAttempts, ({ one }) => ({
  sender: one(senders, {
    fields: [unsubscribeAttempts.senderId],
    references: [senders.id],
  }),
}));

// --- Inferred types ---------------------------------------------------------

export type User = typeof users.$inferSelect;
export type MailAccount = typeof mailAccounts.$inferSelect;
export type Scan = typeof scans.$inferSelect;
export type Sender = typeof senders.$inferSelect;
export type UnsubscribeAttempt = typeof unsubscribeAttempts.$inferSelect;
