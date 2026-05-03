import { PolymarketAPIService } from "./polymarketAPIService.js";
import { DatabaseService } from "./databaseService.js";
import * as Sentry from "@sentry/nextjs";

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
    console.log(`Market update routine started (${intervalMinutes} min interval)`);

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
      console.log("Market update routine stopped");
    }
  }

  /**
   * Fetch all active Polymarket markets from Gamma and upsert them into the
   * lean search-index table. Then remove any markets whose end_date has passed.
   */
  static async updateMarkets(): Promise<void> {
    if (this.isUpdating) return;

    this.isUpdating = true;
    try {
      const markets = await PolymarketAPIService.getOpenMarkets({
        endDateMin: new Date().toISOString(),
      });

      for (const market of markets) {
        await DatabaseService.upsertMarket(market);
      }

      const removed = await DatabaseService.removeEndedMarkets();
      const tagCount = await DatabaseService.refreshTagIndex();
      console.log(
        `market sync: upserted ${markets.length}, removed ${removed} ended, ${tagCount} tags indexed`
      );
    } catch (error) {
      Sentry.captureException(error);
      console.error("Market update failed:", error);
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
