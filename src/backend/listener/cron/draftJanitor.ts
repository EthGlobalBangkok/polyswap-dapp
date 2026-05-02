import { type Address, type Hex } from "viem";
import { getPublicClient } from "../blockchainProvider";
import { DatabaseService } from "@/backend/services/databaseService";
import { getPolymarketOrderService } from "@/backend/services/polymarketOrderService";
import composableCowAbi from "@/abi/composableCoW.json";

const STALE_AFTER_MS = 10 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

function requireComposableCow(): Address {
  const v = process.env.COMPOSABLE_COW;
  if (!v) throw new Error("COMPOSABLE_COW is not set");
  return v as Address;
}

/**
 * Sweep stale draft orders: those still in `draft` status more than
 * STALE_AFTER_MS after creation. For each, cancel any associated Polymarket
 * order and delete the row. Skips drafts whose on-chain conditional order
 * is already authed — the listener will pick those up on its own.
 */
export async function sweepStaleDrafts(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await DatabaseService.findDraftsOlderThan(cutoff);
  if (stale.length === 0) return;

  const client = getPublicClient();
  const composableCow = requireComposableCow();
  const pm = getPolymarketOrderService();
  await pm.initialize();

  for (const draft of stale) {
    try {
      // If a draft already has an order_hash and is authed on-chain, leave
      // it alone — the listener will transition it to `live`. This protects
      // catch-up race windows where the row's status hasn't caught up yet.
      if (draft.order_hash) {
        const exists = await client.readContract({
          address: composableCow,
          abi: composableCowAbi,
          functionName: "singleOrders",
          args: [draft.owner as Address, draft.order_hash as Hex],
        });
        if (exists === true) continue;
      }

      if (draft.polymarket_order_hash) {
        await pm.cancelOrder(draft.polymarket_order_hash);
      }
      await DatabaseService.deletePolyswapOrderById(draft.id);
    } catch (err) {
      console.warn(`draftJanitor failed for order ${draft.id}:`, err);
    }
  }
}

export function startDraftJanitor(intervalSeconds = 60): void {
  if (timer) return;
  timer = setInterval(() => void sweepStaleDrafts(), intervalSeconds * 1000);
  console.log(
    `draftJanitor started: sweep every ${intervalSeconds}s, stale > ${STALE_AFTER_MS / 60_000}min`
  );
}

export function stopDraftJanitor(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
