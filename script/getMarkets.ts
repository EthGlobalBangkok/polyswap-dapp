import { PolymarketAPIService } from '../src/backend/services/polymarketAPIService';

// Example usage function
export async function run() {
  try {
    const markets = await PolymarketAPIService.getOpenMarkets({
      endDateMin: new Date().toISOString(),
    });
    
    console.log(`Retrieved ${markets.length} markets`);
    // write the results to a data.json file
    const fs = require('fs');
    fs.writeFileSync('data.json', JSON.stringify(markets, null, 2));
    
  } catch (error) {
    console.error("Failed to fetch markets:", error);
  }
}

run();