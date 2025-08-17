import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { DatabaseService } from './services/databaseService';
import { MarketUpdateService } from './services/marketUpdateService';
import { 
  ConditionalOrderCreatedEvent, 
  ConditionalOrderParams, 
  PolyswapOrderData, 
  PolyswapOrderRecord 
} from './interfaces/PolyswapOrder';

// Load environment variables
dotenv.config();

// Configuration from .env
const RPC_URL = process.env.RPC_URL!;
const STARTING_BLOCK = parseInt(process.env.STARTING_BLOCK!);
const COMPOSABLE_COW_ADDRESS = process.env.COMPOSABLE_COW!;
const POLYSWAP_HANDLER_ADDRESS = process.env.POLYSWAP_HANDLER!;
const MARKET_UPDATE_INTERVAL = parseInt(process.env.MARKET_UPDATE_INTERVAL_MINUTES!) || 60;

// Event ABI for ConditionalOrderCreated
const CONDITIONAL_ORDER_CREATED_ABI = {
  anonymous: false,
  inputs: [
    {
      indexed: true,
      name: "owner",
      type: "address"
    },
    {
      indexed: false,
      name: "params",
      type: "tuple",
      components: [
        { name: "handler", type: "address" },
        { name: "salt", type: "bytes32" },
        { name: "staticInput", type: "bytes" }
      ]
    }
  ],
  name: "ConditionalOrderCreated",
  type: "event"
};

// Contract ABI (minimal interface for the event)
const COMPOSABLE_COW_ABI = [CONDITIONAL_ORDER_CREATED_ABI];

class PolyswapBlockchainListener {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private isRunning: boolean = false;
  private lastProcessedBlock: number = STARTING_BLOCK;

  constructor() {
    console.log('🚀 Initializing Polyswap Blockchain Listener...');
    console.log(`📡 RPC URL: ${RPC_URL}`);
    console.log(`🏗️  ComposableCoW: ${COMPOSABLE_COW_ADDRESS}`);
    console.log(`🎯 Polyswap Handler: ${POLYSWAP_HANDLER_ADDRESS}`);
    console.log(`📦 Starting Block: ${STARTING_BLOCK}`);

    // Initialize provider and contract
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.contract = new ethers.Contract(
      COMPOSABLE_COW_ADDRESS,
      COMPOSABLE_COW_ABI,
      this.provider
    );
  }

  /**
   * Start the blockchain listener
   */
  async start(): Promise<void> {
    try {
      // Test RPC connection
      const network = await this.provider.getNetwork();
      console.log(`🌐 Connected to network: ${network.name} (Chain ID: ${network.chainId})`);

      // Get the latest processed block from database
      const dbLatestBlock = await DatabaseService.getLatestProcessedBlock();
      this.lastProcessedBlock = Math.max(STARTING_BLOCK, dbLatestBlock);
      
      console.log(`📍 Starting from block: ${this.lastProcessedBlock}`);

      // Process historical events first
      await this.processHistoricalEvents();

      // Start real-time listener
      this.startRealTimeListener();

    } catch (error) {
      console.error('❌ Error starting listener:', error);
      throw error;
    }
  }

  /**
   * Process historical events from lastProcessedBlock to current block
   */
  private async processHistoricalEvents(): Promise<void> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      console.log(`📈 Current block: ${currentBlock}`);

      if (this.lastProcessedBlock >= currentBlock) {
        console.log('✅ No historical events to process');
        return;
      }

      console.log(`🔍 Processing historical events from block ${this.lastProcessedBlock} to ${currentBlock}`);

      // Process in batches to avoid RPC limits
      const BATCH_SIZE = 10000;
      let fromBlock = this.lastProcessedBlock + 1;

      while (fromBlock <= currentBlock) {
        const toBlock = Math.min(fromBlock + BATCH_SIZE - 1, currentBlock);
        
        console.log(`📦 Processing batch: ${fromBlock} - ${toBlock}`);
        
        try {
          await this.processBlockRange(fromBlock, toBlock);
          this.lastProcessedBlock = toBlock;
        } catch (error) {
          console.error(`❌ Error processing batch ${fromBlock}-${toBlock}:`, error);
          // Continue with next batch
        }

        fromBlock = toBlock + 1;
        
        // Small delay to avoid overwhelming the RPC
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('✅ Historical events processing completed');
    } catch (error) {
      console.error('❌ Error processing historical events:', error);
      throw error;
    }
  }

  /**
   * Process events in a specific block range
   */
  private async processBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    try {
      const filter = this.contract.filters.ConditionalOrderCreated();
      const events = await this.contract.queryFilter(filter, fromBlock, toBlock);

      console.log(`📋 Found ${events.length} ConditionalOrderCreated events in blocks ${fromBlock}-${toBlock}`);

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        console.log(`📦 Processing event ${i + 1}/${events.length}`);
        
        // Type guard to check if it's an EventLog
        const isEventLog = 'args' in event;
        const logIndex = 'index' in event ? event.index : ('logIndex' in event ? (event as any).logIndex : 0);
        
        console.log(`   Event structure:`, {
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          logIndex: logIndex,
          hasArgs: isEventLog,
          eventType: typeof event
        });
        
        await this.processEvent(event);
      }
    } catch (error) {
      console.error(`❌ Error querying events for blocks ${fromBlock}-${toBlock}:`, error);
      throw error;
    }
  }

  /**
   * Start real-time event listener
   */
  private startRealTimeListener(): void {
    console.log('🎧 Starting real-time event listener...');
    this.isRunning = true;

    // Listen for new ConditionalOrderCreated events
    this.contract.on('ConditionalOrderCreated', async (owner, params, eventLog) => {
      if (!this.isRunning) return;

      console.log(`🔔 New ConditionalOrderCreated event detected in block ${eventLog.blockNumber}`);
      
      // Create a synthetic event object that matches our processEvent expectations
      const syntheticEvent = {
        ...eventLog,
        args: { owner, params }
      };
      
      await this.processEvent(syntheticEvent as ethers.EventLog);
    });

    // Handle provider connection issues
    this.provider.on('error', (error) => {
      console.error('🔌 Provider error:', error);
      this.reconnect();
    });

    console.log('✅ Real-time listener started successfully');
  }

  /**
   * Process a single ConditionalOrderCreated event
   */
  private async processEvent(event: ethers.EventLog | ethers.Log): Promise<void> {
    try {
      // Type guard and event data extraction
      let owner: string;
      let params: ConditionalOrderParams;
      
      if ('args' in event) {
        // EventLog has args property
        const eventLog = event as ethers.EventLog;
        ({ owner, params } = eventLog.args as any);
      } else {
        // For Log type, we need to decode manually
        console.error('❌ Received Log type instead of EventLog, cannot process');
        return;
      }

      const blockNumber = event.blockNumber;
      const transactionHash = event.transactionHash;
      // Handle different logIndex property names
      const logIndex = 'index' in event ? event.index : 
                      'logIndex' in event ? (event as any).logIndex : 0;

      console.log(`🔍 Processing event: Block ${blockNumber}, Tx ${transactionHash}, LogIndex: ${logIndex}`);
      console.log(`👤 Owner: ${owner}`);
      console.log(`🎯 Handler: ${params?.handler}`);

      // Validate required fields
      if (!blockNumber || !transactionHash || !owner || !params) {
        console.error('❌ Missing required event data');
        console.error('Event data:', { blockNumber, transactionHash, owner, params });
        return;
      }

      // Check if this is a Polyswap order (handler matches our Polyswap handler)
      if (params.handler.toLowerCase() !== POLYSWAP_HANDLER_ADDRESS.toLowerCase()) {
        console.log(`⏭️  Skipping non-Polyswap order (handler: ${params.handler})`);
        return;
      }

      console.log('🎯 Polyswap order detected! Processing...');

      // Decode the staticInput to get Polyswap order data
      const polyswapData = this.decodePolyswapStaticInput(params.staticInput);
      
      // Calculate order hash
      const orderHash = this.calculateOrderHash(params);

      // Create order record with proper validation
      const orderRecord: PolyswapOrderRecord = {
        orderHash,
        owner: owner.toLowerCase(),
        handler: params.handler.toLowerCase(),
        sellToken: polyswapData.sellToken.toLowerCase(),
        buyToken: polyswapData.buyToken.toLowerCase(),
        sellAmount: polyswapData.sellAmount,
        minBuyAmount: polyswapData.minBuyAmount,
        startTime: parseInt(polyswapData.t0),
        endTime: parseInt(polyswapData.t),
        polymarketOrderHash: polyswapData.polymarketOrderHash,
        appData: polyswapData.appData,
        blockNumber: Number(blockNumber),
        transactionHash,
        logIndex: Number(logIndex),
        createdAt: new Date()
      };

      console.log(`📝 Order record to save:`, {
        orderHash,
        owner: orderRecord.owner,
        blockNumber: orderRecord.blockNumber,
        logIndex: orderRecord.logIndex,
        sellToken: orderRecord.sellToken,
        buyToken: orderRecord.buyToken
      });

      // Save to database
      await DatabaseService.insertPolyswapOrder(orderRecord);
      
      console.log(`✅ Polyswap order saved successfully:`);
      console.log(`   Order Hash: ${orderHash}`);
      console.log(`   Sell: ${polyswapData.sellAmount} ${polyswapData.sellToken}`);
      console.log(`   Buy: ${polyswapData.minBuyAmount} ${polyswapData.buyToken}`);
      console.log(`   Time: ${new Date(parseInt(polyswapData.t0) * 1000).toISOString()} - ${new Date(parseInt(polyswapData.t) * 1000).toISOString()}`);

    } catch (error) {
      console.error('❌ Error processing event:', error);
      
      // Safe property access for error logging
      const logIndex = 'index' in event ? event.index : 
                      'logIndex' in event ? (event as any).logIndex : 
                      'Unknown';
      const hasArgs = 'args' in event;
      
      console.error('Event details:', {
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        logIndex: logIndex,
        hasArgs: hasArgs
      });
    }
  }

  /**
   * Decode Polyswap staticInput bytes to PolyswapOrderData
   */
  private decodePolyswapStaticInput(staticInput: string): PolyswapOrderData {
    try {
      const abiCoder = new ethers.AbiCoder();
      
      // Calculate the expected number of fields based on data length
      const dataLength = (staticInput.length - 2) / 2; // Remove 0x and convert to bytes
      const fieldsCount = Math.floor(dataLength / 32); // Each field is 32 bytes
      
      console.log(`📊 StaticInput analysis: ${dataLength} bytes, ${fieldsCount} fields`);
      
      if (fieldsCount === 8) {
        // 8 fields: sellToken, buyToken, receiver, sellAmount, minBuyAmount, t0, t, polymarketOrderHash
        // Missing appData field
        const decoded = abiCoder.decode([
          "address", // sellToken
          "address", // buyToken
          "address", // receiver
          "uint256", // sellAmount
          "uint256", // minBuyAmount
          "uint256", // t0
          "uint256", // t
          "bytes32"  // polymarketOrderHash
        ], staticInput);

        return {
          sellToken: decoded[0],
          buyToken: decoded[1],
          receiver: decoded[2],
          sellAmount: decoded[3].toString(),
          minBuyAmount: decoded[4].toString(),
          t0: decoded[5].toString(),
          t: decoded[6].toString(),
          polymarketOrderHash: decoded[7],
          appData: "0x0000000000000000000000000000000000000000000000000000000000000000" // Default empty bytes32
        };
      } else if (fieldsCount === 9) {
        // 9 fields: full structure with appData
        const decoded = abiCoder.decode([
          "address", // sellToken
          "address", // buyToken
          "address", // receiver
          "uint256", // sellAmount
          "uint256", // minBuyAmount
          "uint256", // t0
          "uint256", // t
          "bytes32", // polymarketOrderHash
          "bytes32"  // appData
        ], staticInput);

        return {
          sellToken: decoded[0],
          buyToken: decoded[1],
          receiver: decoded[2],
          sellAmount: decoded[3].toString(),
          minBuyAmount: decoded[4].toString(),
          t0: decoded[5].toString(),
          t: decoded[6].toString(),
          polymarketOrderHash: decoded[7],
          appData: decoded[8]
        };
      } else {
        throw new Error(`Unexpected number of fields: ${fieldsCount}. Expected 8 or 9.`);
      }
    } catch (error) {
      console.error('❌ Error decoding staticInput:', error);
      console.error('StaticInput:', staticInput);
      console.error('StaticInput length:', staticInput.length);
      
      // Try to decode just the basic fields for debugging
      try {
        const abiCoder = new ethers.AbiCoder();
        const basicDecoded = abiCoder.decode([
          "address", // sellToken
          "address", // buyToken
          "address", // receiver
          "uint256", // sellAmount
          "uint256"  // minBuyAmount
        ], staticInput.slice(0, 162)); // First 5 fields only
        
        console.log('✅ Basic decoding successful:', {
          sellToken: basicDecoded[0],
          buyToken: basicDecoded[1],
          receiver: basicDecoded[2],
          sellAmount: basicDecoded[3].toString(),
          minBuyAmount: basicDecoded[4].toString()
        });
      } catch (basicError) {
        console.error('❌ Even basic decoding failed:', basicError);
      }
      
      throw error;
    }
  }

  /**
   * Calculate order hash from ConditionalOrderParams
   */
  private calculateOrderHash(params: ConditionalOrderParams): string {
    try {
      const abiCoder = new ethers.AbiCoder();
      const encoded = abiCoder.encode([
        "tuple(address,bytes32,bytes)"
      ], [[params.handler, params.salt, params.staticInput]]);

      return ethers.keccak256(encoded);
    } catch (error) {
      console.error('❌ Error calculating order hash:', error);
      throw error;
    }
  }

  /**
   * Reconnect to provider in case of connection issues
   */
  private async reconnect(): Promise<void> {
    console.log('🔄 Attempting to reconnect...');
    this.isRunning = false;
    
    try {
      // Remove all listeners
      this.contract.removeAllListeners();
      
      // Recreate provider and contract
      this.provider = new ethers.JsonRpcProvider(RPC_URL);
      this.contract = new ethers.Contract(
        COMPOSABLE_COW_ADDRESS,
        COMPOSABLE_COW_ABI,
        this.provider
      );

      // Wait a bit before restarting
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Restart the listener
      this.startRealTimeListener();
      
      console.log('✅ Reconnected successfully');
    } catch (error) {
      console.error('❌ Reconnection failed:', error);
      // Try again after a longer delay
      setTimeout(() => this.reconnect(), 30000);
    }
  }

  /**
   * Stop the listener gracefully
   */
  stop(): void {
    console.log('🛑 Stopping listener...');
    this.isRunning = false;
    this.contract.removeAllListeners();
    console.log('✅ Listener stopped');
  }
}

// Main execution
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const runOnlyUpdater = args.includes('--market-update-only') || args.includes('-u');
  const runOnlyListener = args.includes('--listener-only') || args.includes('-l');
  
  if (runOnlyUpdater && runOnlyListener) {
    console.error('❌ Cannot use both --market-update-only and --listener-only flags');
    process.exit(1);
  }

  if (runOnlyUpdater) {
    console.log('🔄 Starting Market Update Service Only');
    console.log('====================================');
    console.log(`📅 Update interval: ${MARKET_UPDATE_INTERVAL} minutes`);
    
    // Test database connection first
    console.log('🔍 Testing database connection...');
    const isConnected = await DatabaseService.getMarketStats();
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

    // Start only the market update routine
    MarketUpdateService.startUpdateRoutine(MARKET_UPDATE_INTERVAL);
    console.log('✅ Market update service started successfully. Press Ctrl+C to stop.');
    
    // Keep the process alive
    process.stdin.resume();
    return;
  }

  // Default behavior: start both services or just listener
  if (runOnlyListener) {
    console.log('🎯 Starting Polyswap Blockchain Listener Only');
    console.log('===========================================');
  } else {
    console.log('🎯 Starting Polyswap Blockchain Listener & Market Update Service');
    console.log('================================================================');
  }

  const listener = new PolyswapBlockchainListener();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    listener.stop();
    if (!runOnlyListener) {
      MarketUpdateService.stopUpdateRoutine();
    }
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    listener.stop();
    if (!runOnlyListener) {
      MarketUpdateService.stopUpdateRoutine();
    }
    process.exit(0);
  });

  try {
    // Start the blockchain listener
    await listener.start();
    console.log('🎧 Blockchain listener is now running.');
    
    // Start the market update routine if not listener-only mode
    if (!runOnlyListener) {
      console.log(`🔄 Starting market update routine with ${MARKET_UPDATE_INTERVAL} minute interval...`);
      MarketUpdateService.startUpdateRoutine(MARKET_UPDATE_INTERVAL);
    }
    
    const servicesMsg = runOnlyListener ? 'Blockchain listener started' : 'All services started';
    console.log(`✅ ${servicesMsg} successfully. Press Ctrl+C to stop.`);
    console.log('\n💡 Available command line options:');
    console.log('   --market-update-only (-u): Run only market update service');
    console.log('   --listener-only (-l): Run only blockchain listener');
    console.log('   (no flags): Run both services');
  } catch (error) {
    console.error('❌ Failed to start services:', error);
    process.exit(1);
  }
}

// Run the listener if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export default PolyswapBlockchainListener;