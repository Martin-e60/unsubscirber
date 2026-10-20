import "./scripts/env";
import type { Config } from "drizzle-kit";

/**
 * Shared configuration for migration generation and database inspection.
 */
const shared = {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
};
const url = process.env.DATABASE_URL ?? "file:./local.db";

export default {
  ...shared,
  ...(url.startsWith("file:")
    ? { dialect: "sqlite", dbCredentials: { url } }
    : { dialect: "turso", dbCredentials: { url, authToken: process.env.DATABASE_AUTH_TOKEN } }),
} satisfies Config;
