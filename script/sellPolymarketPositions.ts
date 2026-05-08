#!/usr/bin/env tsx

/**
 * Script to sell all Polymarket positions
 * Usage: pnpm tsx script/sellPolymarketPositions.ts
 */

// Load environment variables
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { createPublicClient, createWalletClient, type Address, type Hex } from "viem";
import { resilientHttp } from "../src/lib/rpc/resilientHttp.js";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createLogger } from "../src/backend/logger.js";

const log = createLogger("sell-positions");

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from the project root
dotenv.config({ path: resolve(__dirname, "..", ".env") });

import { getPolymarketOrderService } from "../src/backend/services/polymarketOrderService";

// Polymarket Data API endpoint for positions
const POSITIONS_API_URL = "https://data-api.polymarket.com/positions";

// Conditional Tokens (ERC1155) ABI used for approval management
const CONDITIONAL_TOKENS_ABI = [
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

// Updated interface to match the actual API response
interface Position {
  proxyWallet: string;
  asset: string; // This is the tokenId
  conditionId: string;
  size: number; // This is the quantity
  avgPrice: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  curPrice: number; // Current price
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string; // Outcome name (Yes/No)
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string;
  negativeRisk: boolean;
}

async function fetchPositions(ownerAddress: string): Promise<Position[]> {
  log.info(`Fetching positions for address: ${ownerAddress}...`);

  try {
    // Note: The API uses 'user' parameter, not 'owner'
    const url = `${POSITIONS_API_URL}?user=${ownerAddress}`;
    log.info(`Requesting URL: ${url}`);

    const response = await fetch(url, {
      method: "GET",
    });

    log.info(`Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`Response body: ${errorText}`);
      throw new Error(`Failed to fetch positions: ${response.status} ${response.statusText}`);
    }

    const positions: Position[] = await response.json();
    log.info(`Found ${positions.length} positions`);

    return positions;
  } catch (error) {
    log.error("Error fetching positions:", error);
    throw error;
  }
}

async function sellAllPositions() {
  log.info("Starting to sell all Polymarket positions...");

  log.info("Environment variables check:");
  log.info("PK length:", process.env.PK ? process.env.PK.length : "NOT SET");

  if (!process.env.PK) {
    log.error("Private key (PK) is not set in environment variables");
    process.exit(1);
  }

  try {
    // Derive owner address from private key
    // Ensure private key has 0x prefix
    const pk = process.env.PK;
    const privateKey: Hex = (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex;
    const account = privateKeyToAccount(privateKey);
    const ownerAddress: Address = account.address;

    log.info(`Derived owner address: ${ownerAddress}`);

    // Fetch positions
    const positions = await fetchPositions(ownerAddress);

    if (positions.length === 0) {
      log.info("No positions found to sell");
      return;
    }

    // Get the polymarket service
    const polymarketOrderService = getPolymarketOrderService();

    // Initialize the service
    log.info("Initializing Polymarket service...");
    await polymarketOrderService.initialize();

    if (!polymarketOrderService.isReady()) {
      throw new Error("Polymarket service is not ready");
    }

    log.info("Service initialized successfully");

    // --- Approval Logic Start ---
    const CONDITIONAL_TOKEN_ADDRESS = process.env.CONDITIONAL_TOKEN as Address | undefined;
    const POLYMARKET_EXCHANGE_ADDRESS: Address = (process.env.CTF_EXCHANGE_V2_ADDRESS ||
      "0xE111180000d2663C0091e4f400237545B87B996B") as Address;

    if (!CONDITIONAL_TOKEN_ADDRESS) {
      log.warn(
        "CONDITIONAL_TOKEN not found in env. Skipping approval check (might fail if not approved)."
      );
    } else {
      log.info(
        `Checking approval for Operator: ${POLYMARKET_EXCHANGE_ADDRESS} on CT: ${CONDITIONAL_TOKEN_ADDRESS}`
      );

      const rpcUrl = process.env.RPC_URL || "https://polygon-rpc.com";
      const publicClient = createPublicClient({
        chain: polygon,
        transport: resilientHttp(rpcUrl),
      });
      const walletClient = createWalletClient({
        account,
        chain: polygon,
        transport: resilientHttp(rpcUrl),
      });

      try {
        const isApproved = await publicClient.readContract({
          address: CONDITIONAL_TOKEN_ADDRESS,
          abi: CONDITIONAL_TOKENS_ABI,
          functionName: "isApprovedForAll",
          args: [ownerAddress, POLYMARKET_EXCHANGE_ADDRESS],
        });
        log.info(`Current Approval Status: ${isApproved}`);

        if (!isApproved) {
          log.info("Sending setApprovalForAll(true) transaction...");
          const txHash = await walletClient.writeContract({
            account,
            chain: polygon,
            address: CONDITIONAL_TOKEN_ADDRESS,
            abi: CONDITIONAL_TOKENS_ABI,
            functionName: "setApprovalForAll",
            args: [POLYMARKET_EXCHANGE_ADDRESS, true],
          });
          log.info(`Transaction sent: ${txHash}`);

          log.info("Waiting for confirmation...");
          await publicClient.waitForTransactionReceipt({ hash: txHash });
          log.info("Approval confirmed!");
        } else {
          log.info("Already approved.");
        }
      } catch (err) {
        log.error("Failed to check/set approval:", err);
        // We continue, as it might be approved already or we might want to try selling anyway
      }
    }
    // --- Approval Logic End ---

    // Sell each position
    log.info(`Processing ${positions.length} positions...`);

    for (const [index, position] of positions.entries()) {
      log.info(`

Processing position ${index + 1}/${positions.length}:`);
      log.info(`Token ID: ${position.asset}`);
      log.info(`Token Name: ${position.outcome}`);
      log.info(`Quantity: ${position.size}`);
      log.info(`Current Price: ${position.curPrice}`);
      log.info(`Market: ${position.title}`);

      // Skip positions with zero quantity
      const quantity = position.size;
      if (quantity <= 0) {
        log.info("⏭Skipping: No shares to sell");
        continue;
      }

      // Skip positions with zero price
      const currentPrice = position.curPrice;
      if (currentPrice <= 0) {
        log.info("⏭Skipping: Current price is zero");
        continue;
      }

      try {
        log.info(`Creating sell order for ${quantity} shares at price ${currentPrice}...`);

        // Create sell order
        // Note: We're using a slightly lower price to ensure execution (0.95 multiplier)
        const sellPrice = Math.max(0.01, currentPrice * 0.95);

        const orderResult = await polymarketOrderService.postGTCOrder({
          tokenID: position.asset, // asset is the tokenId
          price: sellPrice,
          side: "SELL",
          size: quantity,
        });

        log.info(`Sell order created successfully`);
        log.info(`Order ID: ${orderResult.response.orderID}`);
      } catch (error) {
        log.error(`Error creating sell order:`, error);
      }
    }

    log.info(`

Finished processing all positions`);
  } catch (error) {
    log.error("Error selling positions:", error);
    process.exit(1);
  }
}

// Run the script
sellAllPositions()
  .then(() => {
    log.info("Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    log.error("Script failed:", error);
    process.exit(1);
  });

export default sellAllPositions;
