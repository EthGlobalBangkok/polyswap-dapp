import { promises as fs } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { testConnection } from "../src/backend/db/database";
import { DatabaseService } from "../src/backend/services/databaseService";
import { type Market } from "../src/backend/interfaces/Market";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// The data.json file (populated by pnpm saveMarkets) contains the raw Gamma
// API shape. Map it to the lean Market interface before upserting.
// ---------------------------------------------------------------------------

interface RawGammaMarket {
  id: string;
  slug?: string;
  question?: string;
  category?: string;
  volume?: string | number;
  liquidity?: string | number;
  liquidityNum?: number;
  endDate?: string;
  clobTokenIds?: string; // JSON-encoded string array from Gamma
  active?: boolean;
}

function mapToLean(raw: RawGammaMarket): Market | null {
  if (!raw.id || !raw.slug || !raw.question) return null;

  let clobTokenIds: string[] = [];
  if (raw.clobTokenIds) {
    try {
      const parsed: unknown = JSON.parse(raw.clobTokenIds);
      clobTokenIds = Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      clobTokenIds = [];
    }
  }

  return {
    id: raw.id,
    slug: raw.slug,
    question: raw.question,
    category: raw.category ?? null,
    volume: typeof raw.volume === "number" ? raw.volume : parseFloat(raw.volume ?? "0") || 0,
    liquidity:
      raw.liquidityNum !== undefined
        ? raw.liquidityNum
        : typeof raw.liquidity === "number"
          ? raw.liquidity
          : parseFloat(raw.liquidity ?? "0") || 0,
    endDate: raw.endDate ? new Date(raw.endDate) : null,
    clobTokenIds,
    active: raw.active ?? true,
  };
}

/**
 * Load market data from data.json and upsert into the lean markets table.
 */
async function loadDataFromJson() {
  console.log("🚀 Starting data import from JSON file...");

  try {
    console.log("🔍 Testing database connection...");
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error("❌ Failed to connect to database");
      return;
    }
    console.log("✅ Database connected successfully!");

    console.log("📖 Reading data.json file...");
    const jsonPath = resolve(__dirname, "../data.json");
    const jsonData = await fs.readFile(jsonPath, "utf-8");
    const rawMarkets: RawGammaMarket[] = JSON.parse(jsonData) as RawGammaMarket[];

    console.log(`📊 Found ${rawMarkets.length} markets in JSON file`);

    const batchSize = 100;
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    console.log("💾 Starting upsert (processing in batches)...");

    for (let i = 0; i < rawMarkets.length; i += batchSize) {
      const batch = rawMarkets.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(rawMarkets.length / batchSize);

      console.log(
        `🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} markets)...`
      );

      for (const raw of batch) {
        const lean = mapToLean(raw);
        if (!lean) {
          skipCount++;
          continue;
        }
        try {
          await DatabaseService.upsertMarket(lean);
          successCount++;
        } catch (error) {
          errorCount++;
          console.error(
            `❌ Error upserting market ${raw.id}:`,
            error instanceof Error ? error.message : error
          );
        }
      }

      if (i + batchSize < rawMarkets.length) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    const removed = await DatabaseService.removeEndedMarkets();

    console.log("\n✅ Import completed!");
    console.log(
      `📊 Results: ${successCount} upserted, ${skipCount} skipped, ${errorCount} errors, ${removed} ended markets removed`
    );
  } catch (error) {
    console.error("❌ Error during data import:", error);
    throw error;
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  loadDataFromJson()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { loadDataFromJson };
