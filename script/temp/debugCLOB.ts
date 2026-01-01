#!/usr/bin/env tsx

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "../..", ".env") });

import { getPolymarketOrderService } from "../../src/backend/services/polymarketOrderService";
import { AssetType } from "@polymarket/clob-client";

async function debug() {
  const service = getPolymarketOrderService();
  await service.initialize();
  const client = service.getClient();

  if (!client) {
    throw new Error("Could not get CLOB client");
  }

  const tokenId = "24394670903706558879845790079760859552309100903651562795058188175118941818512";

  console.log("=".repeat(70));
  console.log("CLOB Debug");
  console.log("=".repeat(70));

  // Check current balance before update
  console.log("\n1. Checking balance for token...");
  try {
    const status = await client.getBalanceAllowance({
      asset_type: AssetType.CONDITIONAL,
      token_id: tokenId,
    });
    console.log(`   Balance: ${status.balance}`);
    console.log(`   Allowance: ${status.allowance}`);
  } catch (e: any) {
    console.error(`   Error: ${e.message}`);
  }

  // Call update
  console.log("\n2. Calling updateBalanceAllowance...");
  try {
    await client.updateBalanceAllowance({
      asset_type: AssetType.CONDITIONAL,
      token_id: tokenId,
    });
    console.log("   ✅ Success");
  } catch (e: any) {
    console.error(`   Error: ${e.message}`);
    if (e.response?.data) {
      console.error(`   Response: ${JSON.stringify(e.response.data)}`);
    }
  }

  // Wait a bit
  console.log("\n3. Waiting 3 seconds...");
  await new Promise((r) => setTimeout(r, 3000));

  // Check again
  console.log("\n4. Checking balance again...");
  try {
    const status = await client.getBalanceAllowance({
      asset_type: AssetType.CONDITIONAL,
      token_id: tokenId,
    });
    console.log(`   Balance: ${status.balance}`);
    console.log(`   Allowance: ${status.allowance}`);
  } catch (e: any) {
    console.error(`   Error: ${e.message}`);
  }

  // Try to create a small sell order
  console.log("\n5. Attempting small sell order (0.5 shares at $0.10)...");
  try {
    const order = await (client as any).createAndPostOrder({
      tokenID: tokenId,
      price: 0.1,
      side: "SELL",
      size: 0.5,
    });
    console.log(`   ✅ Order created: ${JSON.stringify(order)}`);
  } catch (e: any) {
    console.error(`   Error: ${e.message}`);
    if (e.response?.data) {
      console.error(`   Response: ${JSON.stringify(e.response.data)}`);
    }
  }

  console.log("\n" + "=".repeat(70));
}

debug()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
