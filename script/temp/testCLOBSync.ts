#!/usr/bin/env tsx

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "../..", ".env") });

import { getPolymarketOrderService } from "../../src/backend/services/polymarketOrderService";
import { AssetType } from "@polymarket/clob-client";

async function test() {
  const service = getPolymarketOrderService();
  await service.initialize();
  const client = service.getClient();

  if (!client) {
    throw new Error("Could not get CLOB client");
  }

  const tokenId = "24394670903706558879845790079760859552309100903651562795058188175118941818512";

  console.log("=".repeat(60));
  console.log("Testing CLOB Balance/Allowance Sync");
  console.log("=".repeat(60));
  console.log(`\nToken ID: ${tokenId}\n`);

  // Step 1: Check current balance/allowance
  console.log("Step 1: Checking current balance/allowance...");
  try {
    const result = await client.getBalanceAllowance({
      asset_type: AssetType.CONDITIONAL,
      token_id: tokenId,
    });
    console.log(`  Balance: ${result.balance}`);
    console.log(`  Allowance: ${result.allowance}`);
  } catch (e: any) {
    console.error(`  ❌ Error: ${e.message}`);
    if (e.response?.data) {
      console.error(`  Response: ${JSON.stringify(e.response.data)}`);
    }
  }

  // Step 2: Try to update balance/allowance
  console.log("\nStep 2: Calling updateBalanceAllowance with token_id...");
  try {
    await client.updateBalanceAllowance({
      asset_type: AssetType.CONDITIONAL,
      token_id: tokenId,
    });
    console.log("  ✅ updateBalanceAllowance succeeded");
  } catch (e: any) {
    console.error(`  ❌ Error: ${e.message}`);
    if (e.response?.data) {
      console.error(`  Response: ${JSON.stringify(e.response.data)}`);
    }
  }

  // Step 3: Wait and check again
  console.log("\nStep 3: Waiting 2 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("\nStep 4: Checking balance/allowance again...");
  try {
    const result = await client.getBalanceAllowance({
      asset_type: AssetType.CONDITIONAL,
      token_id: tokenId,
    });
    console.log(`  Balance: ${result.balance}`);
    console.log(`  Allowance: ${result.allowance}`);
  } catch (e: any) {
    console.error(`  ❌ Error: ${e.message}`);
  }

  // Step 5: Check COLLATERAL (USDC) too
  console.log("\nStep 5: Checking USDC (collateral) balance/allowance...");
  try {
    const result = await client.getBalanceAllowance({
      asset_type: AssetType.COLLATERAL,
    });
    console.log(`  USDC Balance: ${result.balance}`);
    console.log(`  USDC Allowance: ${result.allowance}`);
  } catch (e: any) {
    console.error(`  ❌ Error: ${e.message}`);
  }

  console.log("\n" + "=".repeat(60));
}

test()
  .then(() => {
    console.log("\n✅ Test completed");
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ Test failed:", e);
    process.exit(1);
  });
