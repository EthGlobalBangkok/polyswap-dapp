import { PolymarketAPIService } from './polymarketAPIService.js';
import { DatabaseService } from './databaseService.js';

export class MarketUpdateService {
  private static updateInterval: NodeJS.Timeout | null = null;
  private static isUpdating = false;

  /**
   * Start the market update routine with specified interval
   * @param intervalMinutes Update interval in minutes (from env var)
   */
  static startUpdateRoutine(intervalMinutes: number = 60) {
    if (this.updateInterval) {
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    console.log(`Market update routine started (${intervalMinutes} min interval)`);

    this.updateMarkets();
    this.updateInterval = setInterval(() => {
      this.updateMarkets();
    }, intervalMs);
  }

  /**
   * Stop the market update routine
   */
  static stopUpdateRoutine() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('Market update routine stopped');
    }
  }

  /**
   * Manually trigger a market update
   */
  static async updateMarkets(): Promise<void> {
    if (this.isUpdating) {
      return;
    }

    this.isUpdating = true;
    const startTime = Date.now();

    try {
      const endDateMin = new Date().toISOString();
      const markets = await PolymarketAPIService.getOpenMarkets({
        endDateMin,
      });

      if (markets.length === 0) {
        return;
      }

      const batchSize = 100;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < markets.length; i += batchSize) {
        const batch = markets.slice(i, i + batchSize);

        for (const market of batch) {
          try {
            await DatabaseService.insertMarket(market);
            successCount++;
          } catch (error) {
            console.error(`Error processing market ${market.id}:`, error);
            errorCount++;
          }
        }

        if (i + batchSize < markets.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const shouldRemoveClosed = process.env.AUTO_REMOVE_CLOSED_MARKETS?.toLowerCase() === 'true';
      if (shouldRemoveClosed) {
        await DatabaseService.removeClosedMarkets();
      }

      const duration = (Date.now() - startTime) / 1000;
      console.log(`Market update completed: ${successCount} processed, ${errorCount} errors (${duration.toFixed(1)}s)`);

    } catch (error) {
      console.error('Market update failed:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Get the current status of the update routine
   */
  static getStatus() {
    return {
      isRunning: this.updateInterval !== null,
      isUpdating: this.isUpdating,
      nextUpdate: this.updateInterval ? 'Scheduled' : 'Not scheduled'
    };
  }
}
