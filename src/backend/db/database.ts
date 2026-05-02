import { Pool, type PoolClient, type QueryResult } from "pg";
import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, "../../../.env") });

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "polyswap",
  user: process.env.DB_USER || "polyswap_user",
  password: process.env.DB_PASSWORD || "polyswap_password",
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
};

// Create a connection pool
const pool = new Pool(dbConfig);

// Handle pool errors
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW()");
    console.log("Database connected successfully:", result.rows[0]);
    client.release();
    return true;
  } catch (error) {
    console.error("Database connection error:", error);
    return false;
  }
}

// Get a client from the pool
export async function getClient(): Promise<PoolClient> {
  return await pool.connect();
}

// Execute a query with automatic client management.
// T must satisfy pg's QueryResultRow ({ [column: string]: any }). We use
// Record<string, any> as the bound (not Record<string, unknown>) because
// callers pass concrete interfaces that lack an index signature; TypeScript
// requires the bound to match QueryResultRow's any-typed index signature.
// Callers use query<MyInterface>(...) to get typed rows back.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T extends Record<string, any> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const client = await pool.connect();
  try {
    // params cast: pg's PoolClient.query<T> signature accepts QueryConfigValues<I>
    // (which resolves to any[] at this call site). Our callers pass unknown[], so
    // the cast is structurally necessary; all actual values are valid pg param types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await client.query<T>(text, params as any[]);
    return result;
  } finally {
    client.release();
  }
}

// Close all connections in the pool
export async function closePool(): Promise<void> {
  await pool.end();
}

export default pool;
