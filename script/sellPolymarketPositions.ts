#!/usr/bin/env tsx

/**
 * Script to sell all Polymarket positions
 * Usage: pnpm tsx script/sellPolymarketPositions.ts
 */

// Load environment variables
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { ethers } from "ethers";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from the project root
dotenv.config({ path: resolve(__dirname, "..", ".env") });

import { getPolymarketOrderService } from "../src/backend/services/polymarketOrderService";

// Polymarket Data API endpoint for positions
const POSITIONS_API_URL = "https://data-api.polymarket.com/positions";

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
    const privateKey = pk.startsWith("0x") ? pk : `0x${pk}`;
    const wallet = new ethers.Wallet(privateKey);
    const ownerAddress = wallet.address;

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
