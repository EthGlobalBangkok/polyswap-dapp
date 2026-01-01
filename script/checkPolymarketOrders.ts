#!/usr/bin/env tsx

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "..", ".env") });

import { getPolymarketOrderService } from "../src/backend/services/polymarketOrderService";

// Contract addresses
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const POSITIONS_API_URL = "https://data-api.polymarket.com/positions";

// ERC1155 ABI
const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
];

async function checkOrders() {
  console.log("🔍 Checking Polymarket Orders, Positions & On-Chain Balances...\n");

  const pk = process.env.PK;
  if (!pk) {
    throw new Error("Private key (PK) is not set");
  }
  const privateKey = pk.startsWith("0x") ? pk : `0x${pk}`;
  const wallet = new ethers.Wallet(privateKey);
  const walletAddress = wallet.address;

  console.log(`📍 Wallet Address: ${walletAddress}\n`);

  try {
    const polymarketService = getPolymarketOrderService();
    await polymarketService.initialize();

    if (!polymarketService.isReady()) {
      throw new Error("Polymarket service is not ready");
    }

    console.log("✅ Service initialized\n");

    const client = polymarketService.getClient();
    if (!client) {
      throw new Error("CLOB client not available");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 1: Open Orders (from CLOB API)
    // ═══════════════════════════════════════════════════════════════════════
    console.log("═".repeat(80));
    console.log("📋 OPEN ORDERS (from CLOB API)");
    console.log("═".repeat(80));

    const orders = await client.getOpenOrders({});
    console.log(`Total Active Orders: ${orders.length}\n`);

    const buyOrders = orders.filter((o: any) => o.side === "BUY");
    const sellOrders = orders.filter((o: any) => o.side === "SELL");

    console.log(`🟢 BUY Orders: ${buyOrders.length}`);
    console.log(`🔴 SELL Orders: ${sellOrders.length}`);

    for (const order of orders) {
      const remaining = parseFloat(order.original_size) - parseFloat(order.size_matched || "0");
      const status =
        remaining === 0
          ? "FILLED"
          : parseFloat(order.size_matched || "0") > 0
            ? "PARTIAL"
            : "PENDING";
      console.log(
        `   ${order.side === "BUY" ? "🟢" : "🔴"} ${order.outcome || order.asset_id.slice(0, 20)} | $${order.price} | ${order.original_size} shares | ${status}`
      );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 2: Positions (from Polymarket Data API)
    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(80));
    console.log("💰 POSITIONS (from Polymarket Data API)");
    console.log("═".repeat(80));

    const positionsResponse = await fetch(`${POSITIONS_API_URL}?user=${walletAddress}`);
    const positions = await positionsResponse.json();

    console.log(`Total Positions: ${positions.length}\n`);

    for (const pos of positions) {
      const title = pos.title ? pos.title.slice(0, 40) : "Unknown";
      const tokenId = pos.asset ? pos.asset.slice(0, 30) : "Unknown";
      console.log(
        `   📊 ${pos.outcome} | ${pos.size} shares @ $${pos.curPrice?.toFixed(3) || "?"} | ${title}...`
      );
      console.log(`      Token ID: ${tokenId}...`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 3: On-Chain CTF Balances (scanning recent transfers)
    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(80));
    console.log("⛓️  ON-CHAIN CTF BALANCES (scanning recent transfers)");
    console.log("═".repeat(80));

    const rpcUrl = process.env.RPC_URL || "https://polygon-rpc.com";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const ctfContract = new ethers.Contract(CTF_ADDRESS, ERC1155_ABI, provider);

    // Get recent transfer events (last ~2000 blocks ≈ 1 hour on Polygon)
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - 2000;

    console.log(`Scanning blocks ${fromBlock} to ${currentBlock}...\n`);

    const filter = ctfContract.filters.TransferSingle(null, null, walletAddress);
    const events = await ctfContract.queryFilter(filter, fromBlock, currentBlock);

    console.log(`Found ${events.length} transfer events to your wallet\n`);

    // Get unique token IDs and check balances
    const tokenIds = new Set<string>();
    for (const event of events) {
      if ("args" in event && event.args) {
        tokenIds.add(event.args.id.toString());
      }
    }

    console.log(`Unique tokens received: ${tokenIds.size}`);

    for (const tokenId of tokenIds) {
      const balance = await ctfContract.balanceOf(walletAddress, tokenId);
      const balanceNum = Number(balance) / 1e6;

      // Check if this is in the positions API
      const inAPI = positions.find((p: any) => p.asset === tokenId);
      const apiStatus = inAPI ? "✅ In API" : "⚠️ NOT in API yet";

      console.log(`   Token: ${tokenId.slice(0, 30)}...`);
      console.log(`      On-chain balance: ${balanceNum.toFixed(2)} shares | ${apiStatus}`);

      if (!inAPI && balanceNum > 0) {
        console.log(
          `      ⚡ This position exists on-chain but hasn't been indexed by Polymarket API yet!`
        );
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 4: Summary
    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(80));
    console.log("📊 SUMMARY");
    console.log("═".repeat(80));
    console.log(`   Open BUY orders:  ${buyOrders.length}`);
    console.log(`   Open SELL orders: ${sellOrders.length}`);
    console.log(`   Positions in API: ${positions.length}`);
    console.log(`   On-chain tokens:  ${tokenIds.size}`);
  } catch (error) {
    console.error("❌ Error checking orders:", error);
    process.exit(1);
  }
}

// Run the script
checkOrders()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
