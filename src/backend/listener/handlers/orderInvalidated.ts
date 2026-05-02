import { decodeEventLog, type Log, type Hex, type Address } from "viem";
import gpv2Abi from "@/abi/GPV2Settlement.json";
import { DatabaseService } from "@/backend/services/databaseService";

interface DecodedOrderInvalidated {
  owner: Address;
  orderUid: Hex;
}

function decodeLog(log: Log): DecodedOrderInvalidated | null {
  const decoded = decodeEventLog({
    abi: gpv2Abi,
    data: log.data,
    topics: log.topics,
  });
  if (decoded.eventName !== "OrderInvalidated") return null;
  return decoded.args as unknown as DecodedOrderInvalidated;
}

export async function handleOrderInvalidated(log: Log): Promise<void> {
  const decoded = decodeLog(log);
  if (!decoded) return;
  if (log.transactionHash === null || log.blockNumber === null || log.logIndex === null) {
    return;
  }

  const order = await DatabaseService.getPolyswapOrderByUid(decoded.orderUid);
  if (!order) return;
  if (order.status === "canceled" || order.status === "filled") return;

  await DatabaseService.updateOrderStatusById(order.id, "canceled", {
    fillTransactionHash: log.transactionHash,
    fillBlockNumber: Number(log.blockNumber),
    fillLogIndex: Number(log.logIndex),
  });
}
