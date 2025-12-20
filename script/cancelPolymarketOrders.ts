#!/usr/bin/env tsx

/**
 * Script to cancel all open Polymarket orders and sell all positions
 * Usage: pnpm tsx script/cancelPolymarketOrders.ts
 */

// Load environment variables
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from the project root
dotenv.config({ path: resolve(__dirname, "..", ".env") });

import { getPolymarketOrderService } from "../src/backend/services/polymarketOrderService";

async function cancelAllOrders() {
  console.log("🚀 Initializing Polymarket Order Service...");

  // Debug environment variables
  console.log("🔍 Environment variables check:");
  console.log("   PK length:", process.env.PK ? process.env.PK.length : "NOT SET");
  console.log("   CLOB_API_KEY:", process.env.CLOB_API_KEY ? "SET" : "NOT SET");
  console.log("   CLOB_SECRET:", process.env.CLOB_SECRET ? "SET" : "NOT SET");

  if (!process.env.PK) {
    console.error("❌ Private key (PK) is not set in environment variables");
    process.exit(1);
  }

  try {
    // Get the singleton instance
    const polymarketOrderService = getPolymarketOrderService();

    // Initialize the service
    console.log("🔄 Initializing service...");
    await polymarketOrderService.initialize();

    // Check if service is ready
    if (!polymarketOrderService.isReady()) {
      throw new Error("Polymarket service is not ready");
    }

    console.log("✅ Service initialized successfully");

    // Cancel all orders
    console.log("🗑️  Canceling all open Polymarket orders...");
    const result = await polymarketOrderService.cancelAllOrders();

    console.log("✅ Successfully canceled all orders");
    console.log("Result:", result);
  } catch (error) {
    console.error("❌ Error canceling orders:", error);
    process.exit(1);
  }
}

// Run the script
cancelAllOrders()
  .then(() => {
    console.log("✨ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });

export default cancelAllOrders;
