import { PolymarketAPIService } from "./polymarketAPIService.js";
import { DatabaseService } from "./databaseService.js";
import * as Sentry from "@sentry/nextjs";
import { createLogger } from "../logger.js";

const log = createLogger("market-sync");

export interface MarketUpdateStats {
  fetched: number;
  upserted: number;
  removed: number;
  tagsIndexed: number;
}

export class MarketUpdateService {
  private static updateInterval: NodeJS.Timeout | null = null;
  private static isUpdating = false;

  /**
   * Start the market update routine with the given interval.
   * Fires immediately on start, then on each subsequent interval.
   */
  static startUpdateRoutine(intervalMinutes: number = 60) {
    if (this.updateInterval) return;

    const intervalMs = intervalMinutes * 60 * 1000;
    log.debug(`routine started (${intervalMinutes} min interval)`);

    void this.updateMarkets();
    this.updateInterval = setInterval(() => {
      void this.updateMarkets();
    }, intervalMs);
  }

  /**
   * Stop the market update routine.
   */
  static stopUpdateRoutine() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      log.debug("routine stopped");
    }
  }

  /**
   * Fetch all active Polymarket markets from Gamma and upsert them into the
   * lean search-index table. Then remove any markets whose end_date has passed.
   */
  static async updateMarkets(): Promise<MarketUpdateStats | null> {
    if (this.isUpdating) return null;

    this.isUpdating = true;
    try {
      log.debug("requesting open markets from Polymarket Gamma");
      const markets = await PolymarketAPIService.getOpenMarkets({
        endDateMin: new Date().toISOString(),
      });
      log.debug(`fetched ${markets.length} markets from Gamma`);

      log.debug(`upserting ${markets.length} markets into DB`);
      for (const market of markets) {
        await DatabaseService.upsertMarket(market);
      }
      log.debug("upserts complete");

      const removed = await DatabaseService.removeEndedMarkets();
      const tagsIndexed = await DatabaseService.refreshTagIndex();

      const stats: MarketUpdateStats = {
        fetched: markets.length,
        upserted: markets.length,
        removed,
        tagsIndexed,
      };
      log.info(
        `upserted ${stats.upserted}, removed ${stats.removed} ended, ${stats.tagsIndexed} tags indexed`
      );
      return stats;
    } catch (error) {
      Sentry.captureException(error);
      log.error("update failed:", error);
      return null;
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Returns the current run status of the update routine.
   */
  static getStatus() {
    return {
      isRunning: this.updateInterval !== null,
      isUpdating: this.isUpdating,
      nextUpdate: this.updateInterval ? "Scheduled" : "Not scheduled",
    };
  }
}
