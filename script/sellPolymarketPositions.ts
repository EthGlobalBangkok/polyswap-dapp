#!/usr/bin/env tsx

/**
 * Script to sell all Polymarket positions
 * Usage: pnpm tsx script/sellPolymarketPositions.ts
 */

// Load environment variables
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

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
  console.log(`🔍 Fetching positions for address: ${ownerAddress}...`);

  try {
    // Note: The API uses 'user' parameter, not 'owner'
    const url = `${POSITIONS_API_URL}?user=${ownerAddress}`;
    console.log(`🌐 Requesting URL: ${url}`);

    const response = await fetch(url, {
      method: "GET",
    });

    console.log(`📡 Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Response body: ${errorText}`);
      throw new Error(`Failed to fetch positions: ${response.status} ${response.statusText}`);
    }

    const positions: Position[] = await response.json();
    console.log(`✅ Found ${positions.length} positions`);

    return positions;
  } catch (error) {
    console.error("❌ Error fetching positions:", error);
    throw error;
  }
}

async function sellAllPositions() {
  console.log("🚀 Starting to sell all Polymarket positions...");

  console.log("🔍 Environment variables check:");
  console.log("   PK length:", process.env.PK ? process.env.PK.length : "NOT SET");

  if (!process.env.PK) {
    console.error("❌ Private key (PK) is not set in environment variables");
    process.exit(1);
  }

  try {
    // Derive owner address from private key
    // Ensure private key has 0x prefix
    const pk = process.env.PK;
    const privateKey: Hex = (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex;
    const account = privateKeyToAccount(privateKey);
    const ownerAddress: Address = account.address;

    console.log(`🔐 Derived owner address: ${ownerAddress}`);

    // Fetch positions
    const positions = await fetchPositions(ownerAddress);

    if (positions.length === 0) {
      console.log("✅ No positions found to sell");
      return;
    }

    // Get the polymarket service
    const polymarketOrderService = getPolymarketOrderService();

    // Initialize the service
    console.log("🔄 Initializing Polymarket service...");
    await polymarketOrderService.initialize();

    if (!polymarketOrderService.isReady()) {
      throw new Error("Polymarket service is not ready");
    }

    console.log("✅ Service initialized successfully");

    // --- Approval Logic Start ---
    const CONDITIONAL_TOKEN_ADDRESS = process.env.CONDITIONAL_TOKEN as Address | undefined;
    const POLYMARKET_EXCHANGE_ADDRESS: Address = (process.env.POLYMARKET_CONTRACT_ADDRESS ||
      "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E") as Address;

    if (!CONDITIONAL_TOKEN_ADDRESS) {
      console.warn(
        "⚠️ CONDITIONAL_TOKEN not found in env. Skipping approval check (might fail if not approved)."
      );
    } else {
      console.log(
        `🔍 Checking approval for Operator: ${POLYMARKET_EXCHANGE_ADDRESS} on CT: ${CONDITIONAL_TOKEN_ADDRESS}`
      );

      const rpcUrl = process.env.RPC_URL || "https://polygon-rpc.com";
      const publicClient = createPublicClient({
        chain: polygon,
        transport: http(rpcUrl),
      });
      const walletClient = createWalletClient({
        account,
        chain: polygon,
        transport: http(rpcUrl),
      });

      try {
        const isApproved = await publicClient.readContract({
          address: CONDITIONAL_TOKEN_ADDRESS,
          abi: CONDITIONAL_TOKENS_ABI,
          functionName: "isApprovedForAll",
          args: [ownerAddress, POLYMARKET_EXCHANGE_ADDRESS],
        });
        console.log(`   Current Approval Status: ${isApproved}`);

        if (!isApproved) {
          console.log("   📝 Sending setApprovalForAll(true) transaction...");
          const txHash = await walletClient.writeContract({
            account,
            chain: polygon,
            address: CONDITIONAL_TOKEN_ADDRESS,
            abi: CONDITIONAL_TOKENS_ABI,
            functionName: "setApprovalForAll",
            args: [POLYMARKET_EXCHANGE_ADDRESS, true],
          });
          console.log(`   🚀 Transaction sent: ${txHash}`);

          console.log("   ⏳ Waiting for confirmation...");
          await publicClient.waitForTransactionReceipt({ hash: txHash });
          console.log("   ✅ Approval confirmed!");
        } else {
          console.log("   ✅ Already approved.");
        }
      } catch (err) {
        console.error("   ❌ Failed to check/set approval:", err);
        // We continue, as it might be approved already or we might want to try selling anyway
      }
    }
    // --- Approval Logic End ---

    // Sell each position
    console.log(`🧾 Processing ${positions.length} positions...`);

    for (const [index, position] of positions.entries()) {
      console.log(`

📝 Processing position ${index + 1}/${positions.length}:`);
      console.log(`   Token ID: ${position.asset}`);
      console.log(`   Token Name: ${position.outcome}`);
      console.log(`   Quantity: ${position.size}`);
      console.log(`   Current Price: ${position.curPrice}`);
      console.log(`   Market: ${position.title}`);

      // Skip positions with zero quantity
      const quantity = position.size;
      if (quantity <= 0) {
        console.log("   ⏭️  Skipping: No shares to sell");
        continue;
      }

      // Skip positions with zero price
      const currentPrice = position.curPrice;
      if (currentPrice <= 0) {
        console.log("   ⏭️  Skipping: Current price is zero");
        continue;
      }

      try {
        console.log(`   💰 Creating sell order for ${quantity} shares at price ${currentPrice}...`);

        // Create sell order
        // Note: We're using a slightly lower price to ensure execution (0.95 multiplier)
        const sellPrice = Math.max(0.01, currentPrice * 0.95);

        const orderResult = await polymarketOrderService.postGTCOrder({
          tokenID: position.asset, // asset is the tokenId
          price: sellPrice,
          side: "SELL",
          size: quantity,
        });

        console.log(`   ✅ Sell order created successfully`);
        console.log(`      Order ID: ${orderResult.response.orderID}`);
      } catch (error) {
        console.error(`   ❌ Error creating sell order:`, error);
      }
    }

    console.log(`

🎉 Finished processing all positions`);
  } catch (error) {
    console.error("❌ Error selling positions:", error);
    process.exit(1);
  }
}

// Run the script
sellAllPositions()
  .then(() => {
    console.log("✨ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });

export default sellAllPositions;
