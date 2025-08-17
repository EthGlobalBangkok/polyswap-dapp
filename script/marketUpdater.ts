#!/usr/bin/env tsx
import dotenv from 'dotenv';
import { MarketUpdateService } from '../src/backend/services/marketUpdateService.js';
import { testConnection } from '../src/backend/db/database.js';

// Load environment variables
dotenv.config();

const MARKET_UPDATE_INTERVAL = parseInt(process.env.MARKET_UPDATE_INTERVAL_MINUTES!) || 60;

/**
 * Market Update Service - Standalone runner
 * Runs only the market update routine without the blockchain listener
 */
async function main() {
  console.log('🔄 Starting Market Update Service (Standalone)');
  console.log('===============================================');
  console.log(`📅 Update interval: ${MARKET_UPDATE_INTERVAL} minutes`);

  try {
    // Test database connection first
    console.log('🔍 Testing database connection...');
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('❌ Failed to connect to database');
      process.exit(1);
    }
    console.log('✅ Database connected successfully!');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Received SIGINT, shutting down gracefully...');
      MarketUpdateService.stopUpdateRoutine();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
      MarketUpdateService.stopUpdateRoutine();
      process.exit(0);
    });

    // Start the market update routine
    MarketUpdateService.startUpdateRoutine(MARKET_UPDATE_INTERVAL);
    
    console.log('✅ Market update service started successfully. Press Ctrl+C to stop.');
    console.log('💡 To check status, visit: http://localhost:3000/api/markets/update');
    
    // Keep the process alive
    process.stdin.resume();
    
  } catch (error) {
    console.error('❌ Failed to start market update service:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export default main;
