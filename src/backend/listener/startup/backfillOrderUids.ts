import { type Address } from "viem";
import { OrderUidCalculationService } from "@/backend/services/orderUidCalculationService";
import { DatabaseService } from "@/backend/services/databaseService";
import { getPublicClient } from "../blockchainProvider";

/**
 * Backfill CoW Protocol order UIDs for live orders that are missing them.
 * Runs once on startup to recover from any past listener-down windows where
 * orders were marked live but never had their UID computed.
 */
export async function backfillOrderUids(): Promise<void> {
  OrderUidCalculationService.initialize(getPublicClient());

  const ordersWithoutUid = await DatabaseService.getLiveOrdersWithoutUid();
  if (ordersWithoutUid.length === 0) return;

  for (const order of ordersWithoutUid) {
    if (!order.order_hash) continue;
    try {
      const data = OrderUidCalculationService.createPolyswapOrderDataFromDbOrder(order);
      const uid = await OrderUidCalculationService.calculateCompleteOrderUidOnChain(
        data,
        order.owner as Address
      );
      await DatabaseService.updateOrderUid(order.order_hash, uid);
    } catch (err) {
      console.error(`backfill UID failed for order ${order.id}:`, err);
    }
  }
}
