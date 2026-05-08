import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { prisma } from "./prisma";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, "../../../.env") });

export async function testConnection(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() AS now`;
    console.log("Database connected successfully:", rows[0]);
    return true;
  } catch (error) {
    console.error("Database connection error:", error);
    return false;
  }
}

export async function closePool(): Promise<void> {
  await prisma.$disconnect();
}

export { prisma };
export default prisma;
