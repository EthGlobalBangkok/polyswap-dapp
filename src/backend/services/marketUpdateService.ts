import { PolymarketAPIService } from "./polymarketAPIService.js";
import { DatabaseService } from "./databaseService.js";
import { createLogger } from "../logger.js";

const log = createLogger("market-sync");

function readPositiveInt(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

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
    const startedAt = Date.now();
    try {
      log.info("starting market sync");

      log.debug("requesting open markets from Polymarket Gamma");
      const fetchStart = Date.now();
      const markets = await PolymarketAPIService.getOpenMarkets({
        endDateMin: new Date().toISOString(),
      });
      log.info(`fetched ${markets.length} markets from Gamma in ${Date.now() - fetchStart}ms`);

      const concurrency = readPositiveInt("MARKET_UPSERT_CONCURRENCY", 25);
      log.info(`upserting ${markets.length} markets into DB (concurrency=${concurrency})`);
      const upsertStart = Date.now();
      let done = 0;
      for (let i = 0; i < markets.length; i += concurrency) {
        const chunk = markets.slice(i, i + concurrency);
        await Promise.all(chunk.map((m) => DatabaseService.upsertMarket(m)));
        done += chunk.length;
        const elapsedMs = Date.now() - upsertStart;
        const rate = (done / (elapsedMs / 1000)).toFixed(1);
        const etaMs = ((markets.length - done) / Math.max(done, 1)) * elapsedMs;
        log.debug(
          `upsert progress ${done}/${markets.length} ` +
            `(${rate}/s, eta ${Math.round(etaMs / 1000)}s)`
        );
      }
      log.info(`upserts complete in ${Date.now() - upsertStart}ms`);

      log.debug("removing ended markets");
      const removed = await DatabaseService.removeEndedMarkets();
      log.info(`removed ${removed} ended markets`);

      log.debug("refreshing tag index");
      const tagStart = Date.now();
      const tagsIndexed = await DatabaseService.refreshTagIndex();
      log.info(`tag-index refreshed: ${tagsIndexed} unique tags in ${Date.now() - tagStart}ms`);

      log.debug("refreshing search vectors");
      const searchStart = Date.now();
      const reindexed = await DatabaseService.refreshStaleSearchVectors();
      log.info(
        `search-vec refreshed: ${reindexed} rows reindexed in ${Date.now() - searchStart}ms`
      );

      const stats: MarketUpdateStats = {
        fetched: markets.length,
        upserted: markets.length,
        removed,
        tagsIndexed,
      };
      log.info(
        `sync complete in ${Date.now() - startedAt}ms ` +
          `(upserted=${stats.upserted}, removed=${stats.removed}, tags=${stats.tagsIndexed}, reindexed=${reindexed})`
      );
      return stats;
    } catch (error) {
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
