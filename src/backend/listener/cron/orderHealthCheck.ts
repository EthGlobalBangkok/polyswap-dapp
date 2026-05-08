import {
  type Address,
  type Hex,
  ContractFunctionExecutionError,
  encodeAbiParameters,
  getAddress,
} from "viem";
import { getPublicClient } from "../blockchainProvider";
import { decodePollError, type CowConditionalErrorName } from "../eventDecoder";
import { DatabaseService } from "@/backend/services/databaseService";
import composableCowAbi from "@/abi/composableCoW.json";
import type { DatabasePolyswapOrder } from "@/backend/interfaces/PolyswapOrder";
import { createLogger } from "@/backend/logger";

const log = createLogger("order-health");

const COMPOSABLE_COW: Address = getAddress(
  process.env.COMPOSABLE_COW ?? "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74"
);

const TERMINAL_ERRORS: ReadonlySet<CowConditionalErrorName> = new Set([
  "OrderNotValid",
  "PollNever",
]);

const ZERO_BYTES32: Hex = `0x${"00".repeat(32)}` as Hex;

let timer: NodeJS.Timeout | null = null;

const ORDER_DATA_TUPLE = [
  { type: "address" },
  { type: "address" },
  { type: "address" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "bytes32" },
  { type: "bytes32" },
] as const;

/**
 * Reconstruct the conditional-order staticInput from a DB row. The handler
 * struct layout matches PolyswapOrderData's 9-field tuple.
 */
function reconstructStaticInput(order: DatabasePolyswapOrder): Hex {
  return encodeAbiParameters(ORDER_DATA_TUPLE, [
    order.sell_token as Address,
    order.buy_token as Address,
    order.owner as Address,
    BigInt(order.sell_amount),
    BigInt(order.min_buy_amount),
    BigInt(Math.floor(new Date(order.start_time).getTime() / 1000)),
    BigInt(Math.floor(new Date(order.end_time).getTime() / 1000)),
    (order.polymarket_order_hash ?? ZERO_BYTES32) as Hex,
    (order.app_data ?? ZERO_BYTES32) as Hex,
  ]);
}

async function checkOne(order: DatabasePolyswapOrder): Promise<void> {
  if (!order.handler || !order.salt) {
    // Missing scaffold needed to reconstruct conditional-order params.
    return;
  }

  const client = getPublicClient();
  const params = {
    handler: order.handler as Address,
    salt: order.salt as Hex,
    staticInput: reconstructStaticInput(order),
  };

  try {
    await client.readContract({
      address: COMPOSABLE_COW,
      abi: composableCowAbi,
      functionName: "getTradeableOrderWithSignature",
      args: [order.owner as Address, params, "0x", []],
    });
    // Success: order is currently fillable. Clear any prior error state.
    await DatabaseService.clearOrderError(order.id);
  } catch (err) {
    const data =
      err instanceof ContractFunctionExecutionError
        ? (err.cause as { data?: Hex } | undefined)?.data
        : undefined;
    if (!data) {
      log.error(`unrecognised error for order ${order.id}`, err);
      return;
    }

    const decoded = decodePollError(data);
    if (!decoded) {
      await DatabaseService.setOrderError(order.id, "UnknownRevert", "Unknown revert", null);
      return;
    }

    await DatabaseService.setOrderError(
      order.id,
      decoded.name,
      decoded.reason,
      decoded.retryAt ?? null
    );
    if (TERMINAL_ERRORS.has(decoded.name)) {
      await DatabaseService.updateOrderStatusById(order.id, "errored");
    }
  }
}

/**
 * Fetch the discrete CoW orderbook status for an order with a known
 * order_uid and persist it. Maps terminal CoW states (`fulfilled`,
 * `expired`, `cancelled`) onto our row-level `status` so the UI reflects
 * fills/cancellations even if we miss the on-chain Trade event.
 */
async function pollCowOrderbook(order: DatabasePolyswapOrder): Promise<void> {
  if (!order.order_uid) return;
  const url = `https://api.cow.fi/polygon/api/v1/orders/${order.order_uid}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    log.warn(`cow.fi fetch failed for order ${order.id}`, err);
    return;
  }
  if (res.status === 404) {
    // Not yet indexed by CoW — common right after creation; not an error.
    return;
  }
  if (!res.ok) {
    log.warn(`cow.fi returned ${res.status} for order ${order.id}`);
    return;
  }
  const json: unknown = await res.json();
  if (typeof json !== "object" || json === null) return;
  const status = (json as { status?: unknown }).status;
  if (typeof status !== "string") return;

  await DatabaseService.setCowOrderStatus(order.id, status);

  if (status === "fulfilled") {
    await DatabaseService.updateOrderStatusById(order.id, "filled");
  } else if (status === "expired" || status === "cancelled") {
    await DatabaseService.updateOrderStatusById(order.id, "canceled");
  }
}

export async function runOrderHealthCheck(): Promise<void> {
  const live = await DatabaseService.getLiveOrders();
  if (live.length === 0) {
    log.debug("no live orders to check");
    return;
  }
  log.debug(`checking ${live.length} live order(s)`);
  for (const order of live) {
    try {
      await checkOne(order);
      await pollCowOrderbook(order);
    } catch (err) {
      log.error(`order ${order.id} crashed`, err);
    }
  }
}

export function startOrderHealthCheck(intervalSeconds = 60): void {
  if (timer) return;
  timer = setInterval(() => void runOrderHealthCheck(), intervalSeconds * 1000);
  log.debug(`every ${intervalSeconds}s`);
}

export function stopOrderHealthCheck(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
