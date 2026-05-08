import { PolymarketAPIService } from "../src/backend/services/polymarketAPIService";
import { createLogger } from "../src/backend/logger.js";
import { writeFileSync } from "fs";

const log = createLogger("get-markets");

export async function run() {
  try {
    const markets = await PolymarketAPIService.getOpenMarkets({
      endDateMin: new Date().toISOString(),
    });
    log.info(`retrieved ${markets.length} markets`);
    writeFileSync("data.json", JSON.stringify(markets, null, 2));
    log.info("markets saved to data.json");
  } catch (error) {
    log.error("failed to fetch markets:", error);
  }
}

run();
