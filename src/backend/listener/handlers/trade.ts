import { decodeEventLog, type Log, type Hex, type Address } from "viem";
import gpv2Abi from "@/abi/GPV2Settlement.json";
import { DatabaseService } from "@/backend/services/databaseService";
import { createLogger } from "@/backend/logger";

const log = createLogger("trade");

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

export async function handleTrade(eventLog: Log): Promise<void> {
  const decoded = decodeLog(eventLog);
  if (!decoded) return;
  if (
    eventLog.transactionHash === null ||
    eventLog.blockNumber === null ||
    eventLog.logIndex === null
  ) {
    return;
  }

  const order = await DatabaseService.getPolyswapOrderByUid(decoded.orderUid);
  if (!order) {
    log.debug(`no tracked order for uid ${decoded.orderUid}; skipping`);
    return;
  }

  await DatabaseService.updateOrderStatusById(order.id, "filled", {
    filledAt: new Date(),
    fillTransactionHash: eventLog.transactionHash,
    fillBlockNumber: Number(eventLog.blockNumber),
    fillLogIndex: Number(eventLog.logIndex),
    actualSellAmount: decoded.sellAmount.toString(),
    actualBuyAmount: decoded.buyAmount.toString(),
    feeAmount: decoded.feeAmount.toString(),
  });
  log.info(`order ${order.id} filled (uid ${decoded.orderUid})`);
}
