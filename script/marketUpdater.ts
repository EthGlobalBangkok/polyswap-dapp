#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config();

import { MarketUpdateService } from "../src/backend/services/marketUpdateService.js";
import { testConnection } from "../src/backend/db/database.js";
import { createLogger } from "../src/backend/logger.js";

const log = createLogger("market-updater");

const MARKET_UPDATE_INTERVAL = parseInt(process.env.MARKET_UPDATE_INTERVAL_MINUTES!) || 60;

async function main() {
  log.info(`starting standalone market-update runner (interval ${MARKET_UPDATE_INTERVAL}min)`);

  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      log.error("failed to connect to database");
      process.exit(1);
    }

    process.on("SIGINT", () => {
      log.info("received SIGINT, shutting down");
      MarketUpdateService.stopUpdateRoutine();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      log.info("received SIGTERM, shutting down");
      MarketUpdateService.stopUpdateRoutine();
      process.exit(0);
    });

    MarketUpdateService.startUpdateRoutine(MARKET_UPDATE_INTERVAL);
    log.info("market-update routine started; status at http://localhost:3000/api/markets/update");

    process.stdin.resume();
  } catch (error) {
    log.error("failed to start market-update service:", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    log.error("fatal:", error);
    process.exit(1);
  });
}

export default main;
