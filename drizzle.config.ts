import type { Config } from "drizzle-kit";

/**
 * drizzle-kit reads this to know where the schema lives and how to reach the
 * database. `npm run db:push` uses it to create/update tables.
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./local.db",
  },
} satisfies Config;
