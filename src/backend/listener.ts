import { ethers } from "ethers";
import dotenv from "dotenv";
import { DatabaseService } from "./services/databaseService";
import { MarketUpdateService } from "./services/marketUpdateService";
import { OrderUidCalculationService } from "./services/orderUidCalculationService";
import { PolymarketPositionSellerService } from "./services/polymarketPositionSellerService";
import {
  ConditionalOrderCreatedEvent,
  ConditionalOrderParams,
  PolyswapOrderData,
  PolyswapOrderRecord,
} from "./interfaces/PolyswapOrder";
import * as Sentry from "@sentry/nextjs";

// Import ABI files
import composableCowABI from "../abi/composableCoW.json";
import gpv2SettlementABI from "../abi/GPV2Settlement.json";

// Load environment variables
dotenv.config();

// Configuration from .env
const RPC_URL = process.env.RPC_URL!;
const STARTING_BLOCK = parseInt(process.env.STARTING_BLOCK!);
const COMPOSABLE_COW_ADDRESS = process.env.COMPOSABLE_COW!;
const POLYSWAP_HANDLER_ADDRESS = process.env.NEXT_PUBLIC_POLYSWAP_HANDLER!;
const GPV2_SETTLEMENT_ADDRESS = process.env.GPV2SETTLEMENT!;
const MARKET_UPDATE_INTERVAL = parseInt(process.env.MARKET_UPDATE_INTERVAL_MINUTES!) || 60;
const POSITION_SELL_INTERVAL = parseInt(process.env.POSITION_SELL_INTERVAL_MINUTES!) || 5;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE!) || 100;

// Use imported ABI files
const COMPOSABLE_COW_ABI = composableCowABI;
const GPV2_SETTLEMENT_ABI = gpv2SettlementABI;

class PolyswapBlockchainListener {
  private provider: ethers.JsonRpcProvider;
  private composableCowContract: ethers.Contract;
  private gpv2SettlementContract: ethers.Contract;
  private isRunning: boolean = false;
  private lastProcessedBlock: number = STARTING_BLOCK;
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor() {
    console.log("Initializing Polyswap Blockchain Listener...");

    // Initialize provider and contracts
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.composableCowContract = new ethers.Contract(
      COMPOSABLE_COW_ADDRESS,
      COMPOSABLE_COW_ABI,
      this.provider
    );
    this.gpv2SettlementContract = new ethers.Contract(
      GPV2_SETTLEMENT_ADDRESS,
      GPV2_SETTLEMENT_ABI,
      this.provider
    );

    // Initialize OrderUidCalculationService
    OrderUidCalculationService.initialize(this.provider);
  }

  /**
   * Calculate and update order UIDs for existing live orders
   */
  private async updateOrderUids(): Promise<void> {
    try {
      const ordersWithoutUid = await DatabaseService.getLiveOrdersWithoutUid();

      if (ordersWithoutUid.length === 0) {
        return;
      }

      const network = await this.provider.getNetwork();
      const chainId = Number(network.chainId);

      for (const order of ordersWithoutUid) {
        try {
          // Skip if order_hash is missing
          if (!order.order_hash) {
            console.warn(`Skipping UID calculation for order without hash (ID: ${order.id})`);
            continue;
          }

          const polyswapOrderData =
            OrderUidCalculationService.createPolyswapOrderDataFromDbOrder(order);
          const orderUid = await OrderUidCalculationService.calculateCompleteOrderUidOnChain(
            polyswapOrderData,
            order.owner
          );
          await DatabaseService.updateOrderUid(order.order_hash, orderUid);
        } catch (error) {
          console.error(`Error calculating UID for order ${order.order_hash}:`, error);
        }
      }
    } catch (error) {
      console.error("Error updating order UIDs:", error);
    }
  }

  /**
   * Start the blockchain listener
   */
  async start(): Promise<void> {
    try {
      const network = await this.provider.getNetwork();
      console.log(`Connected to network: ${network.name} (Chain ID: ${network.chainId})`);

      const dbLatestBlock = await DatabaseService.getLatestProcessedBlock();
      this.lastProcessedBlock = Math.max(STARTING_BLOCK, dbLatestBlock);

      await this.updateOrderUids();
      await this.processHistoricalEvents();
      this.startRealTimeListener();
    } catch (error) {
      console.error("Error starting listener:", error);
      throw error;
    }
  }

  /**
   * Process historical events from lastProcessedBlock to current block
   */
  private async processHistoricalEvents(): Promise<void> {
    try {
      const currentBlock = await this.provider.getBlockNumber();

      if (this.lastProcessedBlock >= currentBlock) {
        return;
      }

      let fromBlock = this.lastProcessedBlock + 1;

      while (fromBlock <= currentBlock) {
        const toBlock = Math.min(fromBlock + BATCH_SIZE - 1, currentBlock);

        try {
          await this.processBlockRange(fromBlock, toBlock);
          this.lastProcessedBlock = toBlock;
        } catch (error: any) {
          console.error(`Error processing batch ${fromBlock}-${toBlock}:`, error);
        }

        fromBlock = toBlock + 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error("Error processing historical events:", error);
      throw error;
    }
  }

  /**
   * Process events in a specific block range
   */
  private async processBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    try {
      const tradeFilter = this.gpv2SettlementContract.filters.Trade();
      const tradeEvents = await this.gpv2SettlementContract.queryFilter(
        tradeFilter,
        fromBlock,
        toBlock
      );

      const orderInvalidatedFilter = this.gpv2SettlementContract.filters.OrderInvalidated();
      const orderInvalidatedEvents = await this.gpv2SettlementContract.queryFilter(
        orderInvalidatedFilter,
        fromBlock,
        toBlock
      );

      for (let i = 0; i < tradeEvents.length; i++) {
        const event = tradeEvents[i];
        try {
          await this.processTradeEvent(event);
        } catch (eventError) {
          console.error(`Error processing Trade event ${i + 1}:`, eventError);
        }
      }

      for (let i = 0; i < orderInvalidatedEvents.length; i++) {
        const event = orderInvalidatedEvents[i];
        try {
          await this.processOrderInvalidatedEvent(event);
        } catch (eventError) {
          console.error(`Error processing OrderInvalidated event ${i + 1}:`, eventError);
        }
      }
    } catch (error: any) {
      console.error(`Error querying events for blocks ${fromBlock}-${toBlock}:`, error);
      throw error;
    }
  }

  /**
   * Start polling-based event listener (replaces filter-based listener)
   */
  private startRealTimeListener(): void {
    console.log("Starting polling-based event listener...");
    this.isRunning = true;

    this.pollingInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const currentBlock = await this.provider.getBlockNumber();

        if (currentBlock > this.lastProcessedBlock) {
          const fromBlock = this.lastProcessedBlock + 1;
          const toBlock = Math.min(fromBlock + BATCH_SIZE - 1, currentBlock);

          await this.processBlockRange(fromBlock, toBlock);
          this.lastProcessedBlock = toBlock;
        }
      } catch (error: any) {
        const errorMessage = error?.message || error?.toString() || "";
        // Suppress specific "from block is greater than latest block" error
        if (
          errorMessage.includes("from block is greater than latest block") ||
          (error?.error?.data &&
            typeof error.error.data === "string" &&
            error.error.data.includes("from block is greater than latest block"))
        ) {
          // Do nothing, just valid RPC sync issue
        } else {
          Sentry.captureException(error);
          console.error("Polling error:", error);
        }
      }
    }, 3000);

    console.log("Polling-based listener started successfully");
  }

  /**
   * Process a single ConditionalOrderCreated event
   */
  private async processConditionalOrderCreatedEvent(
    event: ethers.EventLog | ethers.Log
  ): Promise<void> {
    try {
      // Type guard and event data extraction
      let owner: string;
      let params: ConditionalOrderParams;

      if ("args" in event) {
        // EventLog has args property
        const eventLog = event as ethers.EventLog;
        ({ owner, params } = eventLog.args as any);
      } else {
        // For Log type, we need to decode manually
        console.error("❌ Received Log type instead of EventLog, cannot process");
        return;
      }

      const blockNumber = event.blockNumber;
      const transactionHash = event.transactionHash;
      const logIndex =
        "index" in event ? event.index : "logIndex" in event ? (event as any).logIndex : 0;

      if (!blockNumber || !transactionHash || !owner || !params) {
        console.error("Missing required event data");
        return;
      }

      if (params.handler.toLowerCase() !== POLYSWAP_HANDLER_ADDRESS.toLowerCase()) {
        return;
      }

      // Decode the staticInput to get Polyswap order data
      const polyswapData = this.decodePolyswapStaticInput(params.staticInput);

      // Calculate order hash
      const orderHash = this.calculateOrderHash(params);

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
        createdAt: new Date(),
      };

      await DatabaseService.insertPolyswapOrder(orderRecord);
    } catch (error) {
      console.error("Error processing ConditionalOrderCreated event:", error);
    }
  }

  /**
   * Process a single Trade event to check if it fulfills a Polyswap order
   */
  private async processTradeEvent(event: ethers.EventLog | ethers.Log): Promise<void> {
    try {
      // Type guard and event data extraction
      let owner: string;
      let sellToken: string;
      let buyToken: string;
      let sellAmount: string;
      let buyAmount: string;
      let feeAmount: string;
      let orderUid: string;

      if ("args" in event) {
        // EventLog has args property
        const eventLog = event as ethers.EventLog;
        ({ owner, sellToken, buyToken, sellAmount, buyAmount, feeAmount, orderUid } =
          eventLog.args as any);
      } else {
        // For Log type, we need to decode manually
        console.error("❌ Received Log type instead of EventLog for Trade event, cannot process");
        return;
      }

      const blockNumber = event.blockNumber;
      const transactionHash = event.transactionHash;
      const logIndex =
        "index" in event ? event.index : "logIndex" in event ? (event as any).logIndex : 0;

      if (!blockNumber || !transactionHash || !owner || !orderUid) {
        console.error("Missing required Trade event data");
        return;
      }

      try {
        const polyswapOrder = await DatabaseService.getPolyswapOrderByUid(orderUid);

        if (!polyswapOrder) {
          return;
        }

        await DatabaseService.updateOrderStatusById(polyswapOrder.id, "filled", {
          filledAt: new Date(),
          fillTransactionHash: transactionHash,
          fillBlockNumber: Number(blockNumber),
          fillLogIndex: Number(logIndex),
          actualSellAmount: sellAmount.toString(),
          actualBuyAmount: buyAmount.toString(),
          feeAmount: feeAmount.toString(),
        });
      } catch (dbError) {
        console.error("Database error while processing Trade event:", dbError);
      }
    } catch (error) {
      console.error("Error processing Trade event:", error);
    }
  }

  /**
   * Process a single OrderInvalidated event to check if it cancels a Polyswap order
   */
  private async processOrderInvalidatedEvent(event: ethers.EventLog | ethers.Log): Promise<void> {
    try {
      // Type guard and event data extraction
      let owner: string;
      let orderUid: string;

      if ("args" in event) {
        // EventLog has args property
        const eventLog = event as ethers.EventLog;
        ({ owner, orderUid } = eventLog.args as any);
      } else {
        // For Log type, we need to decode manually
        console.error(
          "❌ Received Log type instead of EventLog for OrderInvalidated event, cannot process"
        );
        return;
      }

      const blockNumber = event.blockNumber;
      const transactionHash = event.transactionHash;
      const logIndex =
        "index" in event ? event.index : "logIndex" in event ? (event as any).logIndex : 0;

      if (!blockNumber || !transactionHash || !owner || !orderUid) {
        console.error("Missing required OrderInvalidated event data");
        return;
      }

      try {
        const polyswapOrder = await DatabaseService.getPolyswapOrderByUid(orderUid);

        if (!polyswapOrder) {
          return;
        }

        await DatabaseService.updateOrderStatusById(polyswapOrder.id, "canceled", {
          filledAt: new Date(),
          fillTransactionHash: transactionHash,
          fillBlockNumber: Number(blockNumber),
          fillLogIndex: Number(logIndex),
        });
      } catch (dbError) {
        console.error("Database error while processing OrderInvalidated event:", dbError);
      }
    } catch (error) {
      console.error("Error processing OrderInvalidated event:", error);
    }
  }

  /**
   * Decode Polyswap staticInput bytes to PolyswapOrderData
   */
  private decodePolyswapStaticInput(staticInput: string): PolyswapOrderData {
    try {
      const abiCoder = new ethers.AbiCoder();
      const dataLength = (staticInput.length - 2) / 2;
      const fieldsCount = Math.floor(dataLength / 32);

      if (fieldsCount === 8) {
        // 8 fields: sellToken, buyToken, receiver, sellAmount, minBuyAmount, t0, t, polymarketOrderHash
        // Missing appData field
        const decoded = abiCoder.decode(
          [
            "address", // sellToken
            "address", // buyToken
            "address", // receiver
            "uint256", // sellAmount
            "uint256", // minBuyAmount
            "uint256", // t0
            "uint256", // t
            "bytes32", // polymarketOrderHash
          ],
          staticInput
        );

        return {
          sellToken: decoded[0],
          buyToken: decoded[1],
          receiver: decoded[2],
          sellAmount: decoded[3].toString(),
          minBuyAmount: decoded[4].toString(),
          t0: decoded[5].toString(),
          t: decoded[6].toString(),
          polymarketOrderHash: decoded[7],
          appData: "0x0000000000000000000000000000000000000000000000000000000000000000", // Default empty bytes32
        };
      } else if (fieldsCount === 9) {
        // 9 fields: full structure with appData
        const decoded = abiCoder.decode(
          [
            "address", // sellToken
            "address", // buyToken
            "address", // receiver
            "uint256", // sellAmount
            "uint256", // minBuyAmount
            "uint256", // t0
            "uint256", // t
            "bytes32", // polymarketOrderHash
            "bytes32", // appData
          ],
          staticInput
        );

        return {
          sellToken: decoded[0],
          buyToken: decoded[1],
          receiver: decoded[2],
          sellAmount: decoded[3].toString(),
          minBuyAmount: decoded[4].toString(),
          t0: decoded[5].toString(),
          t: decoded[6].toString(),
          polymarketOrderHash: decoded[7],
          appData: decoded[8],
        };
      } else {
        throw new Error(`Unexpected number of fields: ${fieldsCount}. Expected 8 or 9.`);
      }
    } catch (error) {
      console.error("Error decoding staticInput:", error);
      throw error;
    }
  }

  /**
   * Calculate order hash from ConditionalOrderParams
   */
  private calculateOrderHash(params: ConditionalOrderParams): string {
    try {
      const abiCoder = new ethers.AbiCoder();
      const encoded = abiCoder.encode(
        ["tuple(address,bytes32,bytes)"],
        [[params.handler, params.salt, params.staticInput]]
      );

      return ethers.keccak256(encoded);
    } catch (error) {
      console.error("❌ Error calculating order hash:", error);
      throw error;
    }
  }

  /**
   * Reconnect to provider in case of connection issues
   */
  private async reconnect(): Promise<void> {
    console.log("Attempting to reconnect...");
    this.stop();

    try {
      this.provider = new ethers.JsonRpcProvider(RPC_URL);
      this.composableCowContract = new ethers.Contract(
        COMPOSABLE_COW_ADDRESS,
        COMPOSABLE_COW_ABI,
        this.provider
      );
      this.gpv2SettlementContract = new ethers.Contract(
        GPV2_SETTLEMENT_ADDRESS,
        GPV2_SETTLEMENT_ABI,
        this.provider
      );

      await new Promise((resolve) => setTimeout(resolve, 5000));
      this.startRealTimeListener();
      console.log("Reconnected successfully");
    } catch (error) {
      console.error("Reconnection failed:", error);
      setTimeout(() => this.reconnect(), 30000);
    }
  }

  /**
   * Stop the listener gracefully
   */
  stop(): void {
    console.log("Stopping listener...");
    this.isRunning = false;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    console.log("Listener stopped");
  }
}

// Main execution
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const runOnlyUpdater = args.includes("--market-update-only") || args.includes("-u");
  const runOnlyListener = args.includes("--listener-only") || args.includes("-l");

  if (runOnlyUpdater && runOnlyListener) {
    console.error("Cannot use both --market-update-only and --listener-only flags");
    process.exit(1);
  }

  if (runOnlyUpdater) {
    console.log("Starting Market Update Service Only");
    console.log(`Update interval: ${MARKET_UPDATE_INTERVAL} minutes`);

    await DatabaseService.getMarketStats();
    console.log("Database connected successfully");

    process.on("SIGINT", () => {
      console.log("\nReceived SIGINT, shutting down gracefully...");
      MarketUpdateService.stopUpdateRoutine();
      PolymarketPositionSellerService.stopSellRoutine();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\nReceived SIGTERM, shutting down gracefully...");
      MarketUpdateService.stopUpdateRoutine();
      PolymarketPositionSellerService.stopSellRoutine();
      process.exit(0);
    });

    MarketUpdateService.startUpdateRoutine(MARKET_UPDATE_INTERVAL);
    console.log("Market update service started successfully. Press Ctrl+C to stop.");

    process.stdin.resume();
    return;
  }

  if (runOnlyListener) {
    console.log("Starting Polyswap Blockchain Listener Only");
  } else {
    console.log("Starting Polyswap Blockchain Listener & Market Update Service");
  }

  const listener = new PolyswapBlockchainListener();

  process.on("SIGINT", () => {
    console.log("\nReceived SIGINT, shutting down gracefully...");
    listener.stop();
    if (!runOnlyListener) {
      MarketUpdateService.stopUpdateRoutine();
      PolymarketPositionSellerService.stopSellRoutine();
    }
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nReceived SIGTERM, shutting down gracefully...");
    listener.stop();
    if (!runOnlyListener) {
      MarketUpdateService.stopUpdateRoutine();
      PolymarketPositionSellerService.stopSellRoutine();
    }
    process.exit(0);
  });

  try {
    await listener.start();
    console.log("Blockchain listener is now running.");

    if (!runOnlyListener) {
      console.log(
        `Starting market update routine with ${MARKET_UPDATE_INTERVAL} minute interval...`
      );
      MarketUpdateService.startUpdateRoutine(MARKET_UPDATE_INTERVAL);

      // Start the position seller service to auto-sell executed Polymarket positions
      console.log(
        `Starting position seller routine with ${POSITION_SELL_INTERVAL} minute interval...`
      );
      await PolymarketPositionSellerService.startSellRoutine(POSITION_SELL_INTERVAL);
    }

    const servicesMsg = runOnlyListener ? "Blockchain listener started" : "All services started";
    console.log(`${servicesMsg} successfully. Press Ctrl+C to stop.`);
  } catch (error) {
    console.error("Failed to start services:", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export default PolyswapBlockchainListener;
