import dotenv from "dotenv";
dotenv.config();

import { getAbiItem, type Address, type Log, type AbiEvent } from "viem";
import composableCowAbi from "@/abi/composableCoW.json";
import gpv2Abi from "@/abi/GPV2Settlement.json";
import { testConnection } from "@/backend/db/database";
import { getWebSocketClient } from "./blockchainProvider";
import { handleConditionalOrderCreated } from "./handlers/conditionalOrderCreated";
import { handleTrade } from "./handlers/trade";
import { handleOrderInvalidated } from "./handlers/orderInvalidated";
import { catchupHistoricalEvents } from "./startup/catchupHistoricalEvents";
import { backfillOrderUids } from "./startup/backfillOrderUids";
import { startMarketSync, stopMarketSync } from "./cron/marketSync";
import {
  startPositionSeller,
  stopPositionSeller,
  triggerPositionSell,
} from "./cron/positionSeller";
import { startDraftJanitor, stopDraftJanitor } from "./cron/draftJanitor";

interface RuntimeFlags {
  listenerOnly: boolean;
  marketUpdateOnly: boolean;
}

function readArgs(): RuntimeFlags {
  const argv = new Set(process.argv.slice(2));
  const listenerOnly = argv.has("--listener-only") || argv.has("-l");
  const marketUpdateOnly = argv.has("--market-update-only") || argv.has("-u");

  if (listenerOnly && marketUpdateOnly) {
    console.error("Cannot use both --market-update-only and --listener-only flags");
    process.exit(1);
  }

  return { listenerOnly, marketUpdateOnly };
}

function requireAddress(envName: string): Address {
  const v = process.env[envName];
  if (!v) throw new Error(`${envName} is not set`);
  return v as Address;
}

function readPositiveInt(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const MARKET_UPDATE_INTERVAL_MIN = readPositiveInt("MARKET_UPDATE_INTERVAL_MINUTES", 60);
const POSITION_SELL_INTERVAL_MIN = readPositiveInt("POSITION_SELL_INTERVAL_MINUTES", 5);
const DRAFT_JANITOR_INTERVAL_SEC = readPositiveInt("DRAFT_JANITOR_INTERVAL_SECONDS", 60);

interface Subscriptions {
  unsubscribeAll: () => void;
}

async function startListener(): Promise<Subscriptions> {
  await catchupHistoricalEvents();
  await backfillOrderUids();

  const ws = getWebSocketClient();
  const composableCow = requireAddress("COMPOSABLE_COW");
  const gpv2 = requireAddress("GPV2SETTLEMENT");

  const createdEvent = getAbiItem({
    abi: composableCowAbi,
    name: "ConditionalOrderCreated",
  }) as AbiEvent;
  const tradeEvent = getAbiItem({ abi: gpv2Abi, name: "Trade" }) as AbiEvent;
  const invalidatedEvent = getAbiItem({ abi: gpv2Abi, name: "OrderInvalidated" }) as AbiEvent;

  const unsubCreated = ws.watchEvent({
    address: composableCow,
    event: createdEvent,
    onLogs: (logs: Log[]) => {
      for (const log of logs) {
        void handleConditionalOrderCreated(log);
      }
    },
  });

  const unsubTrade = ws.watchEvent({
    address: gpv2,
    event: tradeEvent,
    onLogs: (logs: Log[]) => {
      for (const log of logs) {
        // Update DB first, then nudge the position-seller for prompt offload.
        void handleTrade(log)
          .then(() => triggerPositionSell())
          .catch((err) => {
            console.error("trade handler chain failed:", err);
          });
      }
    },
  });

  const unsubInvalidated = ws.watchEvent({
    address: gpv2,
    event: invalidatedEvent,
    onLogs: (logs: Log[]) => {
      for (const log of logs) {
        void handleOrderInvalidated(log);
      }
    },
  });

  return {
    unsubscribeAll: () => {
      unsubCreated();
      unsubTrade();
      unsubInvalidated();
    },
  };
}

async function main(): Promise<void> {
  const flags = readArgs();

  await testConnection();
  console.log("listener: database connection verified");

  let subs: Subscriptions | null = null;

  if (!flags.marketUpdateOnly) {
    console.log("listener: starting (catch-up + WebSocket subscriptions)");
    subs = await startListener();
  }

  if (!flags.listenerOnly && !flags.marketUpdateOnly) {
    console.log(`listener: starting position-seller cron every ${POSITION_SELL_INTERVAL_MIN}min`);
    await startPositionSeller(POSITION_SELL_INTERVAL_MIN);

    console.log(`listener: starting draft-janitor cron every ${DRAFT_JANITOR_INTERVAL_SEC}s`);
    startDraftJanitor(DRAFT_JANITOR_INTERVAL_SEC);
  }

  if (!flags.listenerOnly) {
    console.log(`listener: starting market-sync cron every ${MARKET_UPDATE_INTERVAL_MIN}min`);
    startMarketSync(MARKET_UPDATE_INTERVAL_MIN);
  }

  const shutdown = (signal: string): void => {
    console.log(`listener: received ${signal}, shutting down`);
    subs?.unsubscribeAll();
    if (!flags.listenerOnly) stopMarketSync();
    if (!flags.listenerOnly && !flags.marketUpdateOnly) {
      stopPositionSeller();
      stopDraftJanitor();
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const ready = flags.marketUpdateOnly
    ? "market-update only"
    : flags.listenerOnly
      ? "listener only"
      : "all services";
  console.log(`listener: ready (${ready}). Press Ctrl+C to stop.`);

  if (flags.marketUpdateOnly) {
    // Keep the process alive when only the market-sync cron is running.
    process.stdin.resume();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("listener fatal:", err);
    process.exit(1);
  });
}
