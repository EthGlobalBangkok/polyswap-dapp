import { decodeEventLog, type Log, type Hex, type Address } from "viem";
import composableCowAbi from "@/abi/composableCoW.json";
import { DatabaseService } from "@/backend/services/databaseService";
import { calculateOrderHash, decodeStaticInput } from "../eventDecoder";
import type { ConditionalOrderParams } from "@/backend/interfaces/PolyswapOrder";

interface DecodedConditionalOrderCreated {
  owner: Address;
  params: ConditionalOrderParams;
}

function decodeLog(log: Log): DecodedConditionalOrderCreated | null {
  const decoded = decodeEventLog({
    abi: composableCowAbi,
    data: log.data,
    topics: log.topics,
  });
  if (decoded.eventName !== "ConditionalOrderCreated") return null;
  // viem types decoded.args as a tuple/object based on the ABI; cast through
  // a narrowed shape after eventName matches.
  const args = decoded.args as unknown as {
    owner: Address;
    params: { handler: Address; salt: Hex; staticInput: Hex };
  };
  return {
    owner: args.owner,
    params: {
      handler: args.params.handler,
      salt: args.params.salt,
      staticInput: args.params.staticInput,
    },
  };
}

export async function handleConditionalOrderCreated(log: Log): Promise<void> {
  const handlerEnv = process.env.NEXT_PUBLIC_POLYSWAP_HANDLER;
  if (!handlerEnv) {
    console.error("NEXT_PUBLIC_POLYSWAP_HANDLER not set; skipping event");
    return;
  }

  const decoded = decodeLog(log);
  if (!decoded) return;

  // Filter: only process orders for OUR handler.
  if (decoded.params.handler.toLowerCase() !== handlerEnv.toLowerCase()) return;

  if (log.transactionHash === null || log.blockNumber === null || log.logIndex === null) {
    console.error("ConditionalOrderCreated log missing block/tx/index — skipping");
    return;
  }

  const orderHash = calculateOrderHash(decoded.params);
  const data = decodeStaticInput(decoded.params.staticInput as Hex);

  try {
    await DatabaseService.upsertLiveOrderFromEvent({
      owner: decoded.owner,
      orderHash,
      handler: decoded.params.handler,
      salt: decoded.params.salt,
      data,
      transactionHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      logIndex: Number(log.logIndex),
    });
  } catch (err) {
    console.error("upsertLiveOrderFromEvent failed:", err);
  }
}
