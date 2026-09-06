import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

/** Apply committed Drizzle migrations to local SQLite or a Turso database. */
const client = createClient({
  url: process.env.DATABASE_URL ?? "file:./local.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
client.close();
