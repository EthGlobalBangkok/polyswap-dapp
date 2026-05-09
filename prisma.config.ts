import "dotenv/config";
import { defineConfig } from "prisma/config";

function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const name = process.env.DB_NAME;
  if (!host || !user || !password || !name) {
    throw new Error(
      "Database connection not configured. Set DATABASE_URL, or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD."
    );
  }

  const port = process.env.DB_PORT ?? "5432";
  // Managed providers like Nile require SSL. Local Postgres doesn't.
  // pg v8 silently treats `require` as `verify-full` and warns; be explicit.
  const sslmode = host === "localhost" || host === "127.0.0.1" ? "disable" : "verify-full";

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}?sslmode=${sslmode}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: buildDatabaseUrl(),
  },
});
