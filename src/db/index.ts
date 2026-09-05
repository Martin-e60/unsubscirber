import "server-only";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

/**
 * Database connection.
 *
 * Cached on globalThis so Next.js hot reloading in development doesn't open a
 * new connection on every file save.
 *
 * Local development uses a SQLite file. To deploy, point DATABASE_URL at a
 * Turso database (libsql://... plus DATABASE_AUTH_TOKEN) and nothing else
 * changes. To move to Postgres, swap this file's driver for
 * `drizzle-orm/node-postgres` — the schema and every query stay as they are.
 */

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof createDb> | undefined;
};

function createDb() {
  const client = createClient({
    url: process.env.DATABASE_URL ?? "file:./local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return drizzle(client, { schema });
}

export const db = globalForDb.db ?? createDb();

if (process.env.NODE_ENV !== "production") globalForDb.db = db;

export { schema };
