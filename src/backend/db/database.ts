import { prisma } from "./prisma";
import { createLogger } from "../logger";

const log = createLogger("db");

export async function testConnection(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() AS now`;
    log.info(`connected (server time ${rows[0]?.now.toISOString() ?? "unknown"})`);
    return true;
  } catch (error) {
    log.error("connection failed:", error);
    return false;
  }
}

export async function closePool(): Promise<void> {
  await prisma.$disconnect();
}

export { prisma };
export default prisma;
