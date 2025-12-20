import { getPolymarketOrderService } from "../../src/backend/services/polymarketOrderService";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Script to approve USDC allowance via Polymarket CLOB API
 * This tells Polymarket to refresh/check the on-chain approval
 */
async function approveViaPolymarket() {
  try {
    console.log("🔧 Initializing Polymarket service...");
    const service = getPolymarketOrderService();
    await service.initialize();

    console.log("✅ Service initialized\n");

    const client = service.getClient();
    if (!client) {
      throw new Error("Failed to get CLOB client");
    }

    console.log("🚀 Calling Polymarket approve allowances...\n");

    try {
      // This should trigger Polymarket to check/refresh the on-chain allowance
      const result = await client.updateBalanceAllowance();
      console.log("✅ Approve result:", result);
    } catch (error: any) {
      console.error("❌ Approve failed:", error);
      if (error.response) {
        console.error("   Response data:", error.response.data);
        console.error("   Response status:", error.response.status);
      }
      throw error;
    }

    console.log("\n⏳ Waiting 2 seconds for CLOB to sync...\n");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check balance again
    console.log("📊 Checking updated balance & allowance...\n");

    const collateral = await client.getBalanceAllowance({
      asset_type: "COLLATERAL" as any,
    });
    console.log("💵 Collateral (USDC):");
    console.log("   Balance:", collateral.balance);
    console.log("   Allowance:", collateral.allowance);

    const usdcBalance = parseFloat(collateral.balance || "0") / 1000000; // Convert from 6 decimals
    const usdcAllowance = parseFloat(collateral.allowance || "0");

    console.log("\n📈 Analysis:");
    console.log(`   USDC Balance: $${usdcBalance.toFixed(6)}`);
    console.log(
      `   USDC Allowance: $${usdcAllowance > 1000000 ? "∞ UNLIMITED" : usdcAllowance.toFixed(6)}`
    );

    if (usdcAllowance > 0) {
      console.log("\n✅ Success! Allowance is now set on Polymarket CLOB!");
    } else {
      console.log(
        "\n⚠️  Allowance still showing as 0. You may need to wait or contact Polymarket support."
      );
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the script
approveViaPolymarket()
  .then(() => {
    console.log("\n✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
