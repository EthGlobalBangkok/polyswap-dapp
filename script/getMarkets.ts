import { PolymarketAPIService } from '../src/backend/services/polymarketAPIService';
import { writeFileSync } from 'fs';

// Example usage function
export async function run() {
  try {
    const markets = await PolymarketAPIService.getOpenMarkets({
      endDateMin: new Date().toISOString(),
    });
    
    console.log(`Retrieved ${markets.length} markets`);
    // write the results to a data.json file
    writeFileSync('data.json', JSON.stringify(markets, null, 2));
    console.log('Markets saved to data.json');
    
  } catch (error) {
    console.error("Failed to fetch markets:", error);
    // Even if there's an error, the function should have returned whatever markets were fetched
    // But if we reach here, it means the error was thrown before any markets were fetched
    console.log('No markets were fetched due to the error');
  }
}

run();