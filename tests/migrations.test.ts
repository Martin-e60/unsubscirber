import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const tsx = path.resolve("node_modules/tsx/dist/cli.mjs");
const tsconfig = path.resolve("tsconfig.test.json");
const scripts = path.resolve("scripts");
const migrationCount = readdirSync("drizzle").filter((file) => file.endsWith(".sql")).length;

test("the migration command loads .env.local, applies committed SQL and is repeatable", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tidely-migrations-"));
  const database = path.join(directory, "fixture.db");
  writeFileSync(path.join(directory, ".env"), 'DATABASE_URL="file:wrong.db"\n');
  writeFileSync(path.join(directory, ".env.local"), `DATABASE_URL="file:${database.replaceAll("\\", "/")}"\n`);

  try {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", DATABASE_URL: undefined, DATABASE_AUTH_TOKEN: undefined };
    const migrate = () => spawnSync(process.execPath, [tsx, "--tsconfig", tsconfig, path.join(scripts, "migrate.mts")], {
      cwd: directory, env, encoding: "utf8", timeout: 30_000,
    });
    const first = migrate();
    assert.equal(first.status, 0, first.stderr || String(first.error));
    assert.equal(existsSync(path.join(directory, "wrong.db")), false, ".env.local takes precedence");
    const second = migrate();
    assert.equal(second.status, 0, second.stderr || String(second.error));

    // Inspect in a child too: native SQLite statement handles can outlive
    // client.close() on Windows and prevent the fixture from being removed.
    const inspected = spawnSync(process.execPath, ["--input-type=module", "--eval", `
      import { createClient } from "@libsql/client";
      const client = createClient({ url: process.env.DATABASE_URL });
      try {
        const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
        const applied = await client.execute("SELECT count(*) AS total FROM __drizzle_migrations");
        console.log(JSON.stringify({ tables: tables.rows.map(row => row.name), migrations: applied.rows[0].total }));
      } finally { client.close(); }
    `], { env: { ...process.env, DATABASE_URL: `file:${database.replaceAll("\\", "/")}` }, encoding: "utf8", timeout: 30_000 });
    assert.equal(inspected.status, 0, inspected.stderr || String(inspected.error));
    const result = JSON.parse(inspected.stdout) as { tables: string[]; migrations: number };
    for (const table of ["users", "mail_accounts", "senders", "scanned_messages", "clear_out_runs", "password_reset_tokens"]) {
      assert.ok(result.tables.includes(table), `${table} was migrated`);
    }
    assert.equal(result.migrations, migrationCount, "running twice never duplicates a migration");
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("sample seeding refuses production and hosted databases before opening a connection", () => {
  for (const overrides of [
    { NODE_ENV: "production", DATABASE_URL: "file::memory:" },
    { NODE_ENV: "development", DATABASE_URL: "libsql://fixture.example" },
  ] as const) {
    const result = spawnSync(process.execPath, [tsx, "--tsconfig", tsconfig, path.join(scripts, "seed.mts")], {
      env: { ...process.env, ...overrides }, encoding: "utf8", timeout: 30_000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Sample data can only be seeded into a local development database/);
  }
});
