import { decodeEventLog, type Log, type Hex, type Address } from "viem";
import gpv2Abi from "@/abi/GPV2Settlement.json";
import { DatabaseService } from "@/backend/services/databaseService";

interface DecodedTrade {
  owner: Address;
  sellToken: Address;
  buyToken: Address;
  sellAmount: bigint;
  buyAmount: bigint;
  feeAmount: bigint;
  orderUid: Hex;
}

function decodeLog(log: Log): DecodedTrade | null {
  const decoded = decodeEventLog({
    abi: gpv2Abi,
    data: log.data,
    topics: log.topics,
  });
  if (decoded.eventName !== "Trade") return null;
  return decoded.args as unknown as DecodedTrade;
}

export async function handleTrade(log: Log): Promise<void> {
  const decoded = decodeLog(log);
  if (!decoded) return;
  if (log.transactionHash === null || log.blockNumber === null || log.logIndex === null) {
    return;
  }

  const order = await DatabaseService.getPolyswapOrderByUid(decoded.orderUid);
  if (!order) return;

  await DatabaseService.updateOrderStatusById(order.id, "filled", {
    filledAt: new Date(),
    fillTransactionHash: log.transactionHash,
    fillBlockNumber: Number(log.blockNumber),
    fillLogIndex: Number(log.logIndex),
    actualSellAmount: decoded.sellAmount.toString(),
    actualBuyAmount: decoded.buyAmount.toString(),
    feeAmount: decoded.feeAmount.toString(),
  });
}
