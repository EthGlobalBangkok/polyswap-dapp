#!/usr/bin/env tsx

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { createPublicClient, parseAbiItem, type Address, type Hex } from "viem";
import { resilientHttp } from "../src/lib/rpc/resilientHttp.js";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { OpenOrder } from "@polymarket/clob-client-v2";
import { createLogger } from "../src/backend/logger.js";

const log = createLogger("check-orders");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, "..", ".env") });

import { getPolymarketOrderService } from "../src/backend/services/polymarketOrderService";

// Contract addresses
const CTF_ADDRESS: Address = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const POSITIONS_API_URL = "https://data-api.polymarket.com/positions";

// ERC1155 ABI (viem JSON form) for balanceOf reads
const ERC1155_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

// CTF ERC1155 TransferSingle event (used to scan recent inbound transfers)
const TRANSFER_SINGLE_EVENT = parseAbiItem(
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)"
);

// Polymarket Data API position shape (subset we use here)
interface PolymarketPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  curPrice: number;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string;
  negativeRisk: boolean;
}

async function checkOrders() {
  log.info("Checking Polymarket Orders, Positions & On-Chain Balances...");

  const pk = process.env.PK;
  if (!pk) {
    throw new Error("Private key (PK) is not set");
  }
  const privateKey: Hex = (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex;
  const account = privateKeyToAccount(privateKey);
  const walletAddress: Address = account.address;

  log.info(`Wallet Address: ${walletAddress}`);

  try {
    const polymarketService = getPolymarketOrderService();
    await polymarketService.initialize();

    if (!polymarketService.isReady()) {
      throw new Error("Polymarket service is not ready");
    }

    log.info("Service initialized");

    const client = polymarketService.getClient();
    if (!client) {
      throw new Error("CLOB client not available");
    }

    log.info("OPEN ORDERS (from CLOB API)");

    const orders: OpenOrder[] = await client.getOpenOrders({});
    log.info(`Total Active Orders: ${orders.length}`);

    const buyOrders = orders.filter((o) => o.side === "BUY");
    const sellOrders = orders.filter((o) => o.side === "SELL");

    log.info(`BUY Orders: ${buyOrders.length}`);
    log.info(`SELL Orders: ${sellOrders.length}`);

    for (const order of orders) {
      const remaining = parseFloat(order.original_size) - parseFloat(order.size_matched || "0");
      const status =
        remaining === 0
          ? "FILLED"
          : parseFloat(order.size_matched || "0") > 0
            ? "PARTIAL"
            : "PENDING";
      log.info(
        `   ${order.side === "BUY" ? "" : ""} ${order.outcome || order.asset_id.slice(0, 20)} | $${order.price} | ${order.original_size} shares | ${status}`
      );
    }

    log.info("POSITIONS (from Polymarket Data API)");

    const positionsResponse = await fetch(`${POSITIONS_API_URL}?user=${walletAddress}`);
    const positions: PolymarketPosition[] = await positionsResponse.json();

    log.info(`Total Positions: ${positions.length}`);

    for (const pos of positions) {
      const title = pos.title ? pos.title.slice(0, 40) : "Unknown";
      const tokenId = pos.asset ? pos.asset.slice(0, 30) : "Unknown";
      log.info(
        `   ${pos.outcome} | ${pos.size} shares @ $${pos.curPrice?.toFixed(3) || "?"} | ${title}...`
      );
      log.info(`Token ID: ${tokenId}...`);
    }

    log.info("ON-CHAIN CTF BALANCES (scanning recent transfers)");

    const rpcUrl = process.env.RPC_URL || "https://polygon-rpc.com";
    const publicClient = createPublicClient({
      chain: polygon,
      transport: resilientHttp(rpcUrl),
    });

    // Get recent transfer events (last ~2000 blocks ≈ 1 hour on Polygon)
    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = currentBlock - 2000n;

    log.info(`Scanning blocks ${fromBlock} to ${currentBlock}...`);

    const logs = await publicClient.getLogs({
      address: CTF_ADDRESS,
      event: TRANSFER_SINGLE_EVENT,
      args: {
        to: walletAddress,
      },
      fromBlock,
      toBlock: currentBlock,
    });

    log.info(`Found ${logs.length} transfer events to your wallet`);

    // Get unique token IDs and check balances
    const tokenIds = new Set<string>();
    for (const log of logs) {
      const id = log.args.id;
      if (typeof id === "bigint") {
        tokenIds.add(id.toString());
      }
    }

    log.info(`Unique tokens received: ${tokenIds.size}`);

    for (const tokenId of tokenIds) {
      const balance = await publicClient.readContract({
        address: CTF_ADDRESS,
        abi: ERC1155_ABI,
        functionName: "balanceOf",
        args: [walletAddress, BigInt(tokenId)],
      });
      const balanceNum = Number(balance) / 1e6;

      // Check if this is in the positions API
      const inAPI = positions.find((p) => p.asset === tokenId);
      const apiStatus = inAPI ? "In API" : "NOT in API yet";

      log.info(`Token: ${tokenId.slice(0, 30)}...`);
      log.info(`On-chain balance: ${balanceNum.toFixed(2)} shares | ${apiStatus}`);

      if (!inAPI && balanceNum > 0) {
        log.info(
          `      This position exists on-chain but hasn't been indexed by Polymarket API yet!`
        );
      }
    }

    log.info("SUMMARY");
    log.info(`Open BUY orders:  ${buyOrders.length}`);
    log.info(`Open SELL orders: ${sellOrders.length}`);
    log.info(`Positions in API: ${positions.length}`);
    log.info(`On-chain tokens:  ${tokenIds.size}`);
  } catch (error) {
    log.error("Error checking orders:", error);
    process.exit(1);
  }
}

// Run the script
checkOrders()
  .then(() => {
    log.info("Done.");
    process.exit(0);
  })
  .catch((error) => {
    log.error("Script failed:", error);
    process.exit(1);
  });
