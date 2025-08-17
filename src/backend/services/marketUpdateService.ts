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
      console.log('⚠️ Market update routine is already running');
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000; // Convert minutes to milliseconds
    console.log(`🚀 Starting market update routine with ${intervalMinutes} minute interval`);

    // Run immediately on start
    this.updateMarkets();

    // Set up recurring updates
    this.updateInterval = setInterval(() => {
      this.updateMarkets();
    }, intervalMs);

    console.log(`✅ Market update routine started successfully`);
  }

  /**
   * Stop the market update routine
   */
  static stopUpdateRoutine() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('🛑 Market update routine stopped');
    }
  }

  /**
   * Manually trigger a market update
   */
  static async updateMarkets(): Promise<void> {
    if (this.isUpdating) {
      console.log('⏳ Market update already in progress, skipping...');
      return;
    }

    this.isUpdating = true;
    const startTime = Date.now();
    console.log(`🔄 Starting market update at ${new Date().toISOString()}`);

    try {
      // Get current database stats
      const statsBefore = await DatabaseService.getMarketStats();
      console.log(`📊 Current DB stats: ${statsBefore.totalMarkets} markets, $${statsBefore.totalVolume.toFixed(2)} total volume`);

      // Fetch markets from Polymarket API
      console.log('📡 Fetching markets from Polymarket API...');
      const endDateMin = new Date().toISOString(); // Only get active markets
      const markets = await PolymarketAPIService.getOpenMarkets({
        endDateMin,
      });

      console.log(`✅ Fetched ${markets.length} active markets from API`);

      if (markets.length === 0) {
        console.log('⚠️ No markets returned from API, skipping database update');
        return;
      }

      // Process markets in batches for better performance
      const batchSize = 50;
      let successCount = 0;
      let errorCount = 0;

      console.log(`📦 Processing markets in batches of ${batchSize}...`);

      for (let i = 0; i < markets.length; i += batchSize) {
        const batch = markets.slice(i, i + batchSize);
        console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(markets.length / batchSize)} (${batch.length} markets)`);

        for (const market of batch) {
          try {
            // Use insertMarket which handles both insert and update via ON CONFLICT
            await DatabaseService.insertMarket(market);
            successCount++;
          } catch (error) {
            console.error(`❌ Error processing market ${market.id}:`, error);
            errorCount++;
          }
        }

        // Small delay between batches to avoid overwhelming the database
        if (i + batchSize < markets.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Get updated database stats
      const statsAfter = await DatabaseService.getMarketStats();
      
      const duration = (Date.now() - startTime) / 1000;
      console.log(`✅ Market update completed in ${duration.toFixed(2)}s`);
      console.log(`📈 Results: ${successCount} processed, ${errorCount} errors`);
      console.log(`📊 New DB stats: ${statsAfter.totalMarkets} markets (+${statsAfter.totalMarkets - statsBefore.totalMarkets}), $${statsAfter.totalVolume.toFixed(2)} total volume`);

    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      console.error(`❌ Market update failed after ${duration.toFixed(2)}s:`, error);
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
