import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client instance for the entire backend (Vercel API + listener).
 * Cached on `globalThis` to survive Next.js dev-server hot reloads without
 * leaking connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.LOG_LEVEL === "debug"
        ? [{ emit: "event", level: "query" }, "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
