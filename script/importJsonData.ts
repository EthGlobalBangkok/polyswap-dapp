import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { testConnection } from '../src/backend/db/database';
import { DatabaseService } from '../src/backend/services/databaseService';
import { Market } from '../src/backend/interfaces/Market';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Script to load market data from data.json and save it to the database
 */
async function loadDataFromJson() {
  console.log('🚀 Starting data import from JSON file...');
  
  try {
    // Test database connection first
    console.log('🔍 Testing database connection...');
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('❌ Failed to connect to database');
      return;
    }
    console.log('✅ Database connected successfully!');
    
    // Read the JSON file
    console.log('📖 Reading data.json file...');
    const jsonPath = resolve(__dirname, '../data.json');
    const jsonData = await fs.readFile(jsonPath, 'utf-8');
    const markets: Market[] = JSON.parse(jsonData);
    
    console.log(`📊 Found ${markets.length} markets in JSON file`);
    
    // Get current database statistics
    console.log('📈 Getting current database statistics...');
    const statsBefore = await DatabaseService.getMarketStats();
    console.log('Current stats:', {
      totalMarkets: statsBefore.totalMarkets,
      totalVolume: statsBefore.totalVolume.toFixed(2),
      avgVolume: statsBefore.avgVolume.toFixed(2)
    });
    
    // Process markets in batches to avoid overwhelming the database
    const batchSize = 100;
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    
    console.log('💾 Starting bulk insert (processing in batches)...');
    
    for (let i = 0; i < markets.length; i += batchSize) {
      const batch = markets.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(markets.length / batchSize);
      
      console.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} markets)...`);
      
      for (const market of batch) {
        try {
          await DatabaseService.insertMarket(market);
          successCount++;
        } catch (error) {
          errorCount++;
          console.error(`❌ Error inserting market ${market.id} (${market.question.substring(0, 50)}...):`, 
            error instanceof Error ? error.message : error);
        }
        processedCount++;
        
        // Show progress every 500 markets
        if (processedCount % 500 === 0) {
          console.log(`📊 Progress: ${processedCount}/${markets.length} markets processed (${successCount} success, ${errorCount} errors)`);
        }
      }
      
      // Small delay between batches to be gentle on the database
      if (i + batchSize < markets.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    console.log('✅ Bulk insert completed!');
    console.log(`📊 Final results: ${successCount} successful, ${errorCount} errors out of ${markets.length} total markets`);
    
    // Get updated database statistics
    console.log('📈 Getting updated database statistics...');
    const statsAfter = await DatabaseService.getMarketStats();
    console.log('Updated stats:', {
      totalMarkets: statsAfter.totalMarkets,
      totalVolume: statsAfter.totalVolume.toFixed(2),
      avgVolume: statsAfter.avgVolume.toFixed(2),
      marketsEndingToday: statsAfter.marketsEndingToday
    });
    
    console.log(`📈 Added ${statsAfter.totalMarkets - statsBefore.totalMarkets} new markets to database`);
    
    // Show some sample queries
    console.log('\n🔍 Running sample queries...');
    
    // Find Trump-related markets
    const trumpMarkets = await DatabaseService.getMarketsByQuestion('Trump');
    console.log(`Found ${trumpMarkets.length} markets containing "Trump"`);
    
    // Find high-volume markets
    const highVolumeMarkets = await DatabaseService.getMarketsByVolume(100000);
    console.log(`Found ${highVolumeMarkets.length} markets with volume > 100,000`);
    
    // Find markets ending soon
    const soonEndingMarkets = await DatabaseService.getMarketsEndingAfter(new Date());
    console.log(`Found ${soonEndingMarkets.length} markets ending after today`);
    
    console.log('\n✅ Data import completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during data import:', error);
    throw error;
  }
}

/**
 * Alternative function to load data with filtering options
 */
async function loadDataFromJsonWithFilters(options: {
  minVolume?: number;
  maxMarkets?: number;
  onlyActive?: boolean;
  endDateAfter?: Date;
}) {
  console.log('🚀 Starting filtered data import from JSON file...');
  console.log('Filters:', options);
  
  try {
    // Test database connection first
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('❌ Failed to connect to database');
      return;
    }
    
    // Read and filter the JSON file
    const jsonPath = resolve(__dirname, '../data.json');
    const jsonData = await fs.readFile(jsonPath, 'utf-8');
    let markets: Market[] = JSON.parse(jsonData);
    
    console.log(`📊 Found ${markets.length} total markets in JSON file`);
    
    // Apply filters
    if (options.minVolume !== undefined) {
      markets = markets.filter(m => parseFloat(m.volume) >= options.minVolume!);
      console.log(`📊 After volume filter (>= ${options.minVolume}): ${markets.length} markets`);
    }
    
    if (options.onlyActive) {
      markets = markets.filter(m => m.active);
      console.log(`📊 After active filter: ${markets.length} markets`);
    }
    
    if (options.endDateAfter) {
      markets = markets.filter(m => new Date(m.endDate) > options.endDateAfter!);
      console.log(`📊 After end date filter: ${markets.length} markets`);
    }
    
    if (options.maxMarkets !== undefined && markets.length > options.maxMarkets) {
      markets = markets.slice(0, options.maxMarkets);
      console.log(`📊 After max limit: ${markets.length} markets`);
    }
    
    // Insert filtered markets
    await DatabaseService.insertMarkets(markets);
    
    console.log('✅ Filtered data import completed!');
    
  } catch (error) {
    console.error('❌ Error during filtered data import:', error);
    throw error;
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
Usage: npm run import:json [options]

Options:
  --filtered          Use filtered import
  --min-volume N      Only import markets with volume >= N
  --max-markets N     Limit to N markets
  --active-only       Only import active markets
  --future-only       Only import markets ending in the future
  --help              Show this help message

Examples:
  npm run import:json
  npm run import:json -- --filtered --min-volume 10000 --max-markets 100 --active-only
`);
    process.exit(0);
  }
  
  if (args.includes('--filtered')) {
    const options: any = {};
    
    const minVolumeIndex = args.indexOf('--min-volume');
    if (minVolumeIndex !== -1 && args[minVolumeIndex + 1]) {
      options.minVolume = parseFloat(args[minVolumeIndex + 1]);
    }
    
    const maxMarketsIndex = args.indexOf('--max-markets');
    if (maxMarketsIndex !== -1 && args[maxMarketsIndex + 1]) {
      options.maxMarkets = parseInt(args[maxMarketsIndex + 1]);
    }
    
    if (args.includes('--active-only')) {
      options.onlyActive = true;
    }
    
    if (args.includes('--future-only')) {
      options.endDateAfter = new Date();
    }
    
    loadDataFromJsonWithFilters(options)
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    loadDataFromJson()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}

export { loadDataFromJson, loadDataFromJsonWithFilters };
