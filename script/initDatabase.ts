#!/usr/bin/env tsx

/**
 * Apply database/init/01-init.sql against the configured database.
 *
 * Connection: prefers DATABASE_URL (e.g. Nile-style postgres://user:pass@host/db?sslmode=require);
 * falls back to DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD.
 *
 * The init script is idempotent (CREATE TABLE/INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
 * CREATE TRIGGER guarded by DROP-IF-EXISTS). Safe to re-run on a partially-initialised DB.
 *
 * Usage:
 *   pnpm db:init
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { readFileSync } from "fs";
import { Client, type ClientConfig } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "..", ".env") });

const SQL_PATH = resolve(__dirname, "..", "database", "init", "01-init.sql");

function buildClientConfig(): ClientConfig {
  const url = process.env.DATABASE_URL;
  if (url && url.length > 0) {
    // Nile (and most managed Postgres providers) require SSL. Reject-unauthorized
    // would force a CA bundle; relaxing keeps the script usable across providers.
    const needsSsl = !url.includes("sslmode=disable");
    return {
      connectionString: url,
      ssl: needsSsl ? { rejectUnauthorized: false } : false,
    };
  }

  const host = process.env.DB_HOST;
  if (!host) {
    throw new Error(
      "Database connection not configured. Set either DATABASE_URL or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD."
    );
  }

  return {
    host,
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl:
      process.env.DB_SSL === "false"
        ? false
        : host === "localhost" || host === "127.0.0.1"
          ? false
          : { rejectUnauthorized: false },
  };
}

/**
 * The init SQL was originally written for `psql` and may include backslash
 * meta-commands like `\c polyswap;` that the `pg` driver cannot execute.
 * Strip those — connection target is selected by the client config, not the
 * SQL itself.
 */
function stripPsqlMetaCommands(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !/^\s*\\/.test(line))
    .join("\n");
}

async function main(): Promise<void> {
  const sql = stripPsqlMetaCommands(readFileSync(SQL_PATH, "utf8"));
  const config = buildClientConfig();

  const target =
    "connectionString" in config && config.connectionString
      ? new URL(config.connectionString).host
      : `${config.host}:${config.port ?? 5432}/${config.database ?? "<unset>"}`;

  console.log(`Applying ${SQL_PATH}`);
  console.log(`Target  ${target}`);

  const client = new Client(config);
  await client.connect();

  const started = Date.now();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log(`Done in ${Date.now() - started}ms`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
