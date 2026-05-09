import { decodeEventLog, type Log, type Hex, type Address } from "viem";
import composableCowAbi from "@/abi/composableCoW.json";
import { DatabaseService } from "@/backend/services/databaseService";
import { calculateOrderHash, decodeStaticInput } from "../eventDecoder";
import type { ConditionalOrderParams } from "@/backend/interfaces/PolyswapOrder";
import { createLogger } from "@/backend/logger";

const log = createLogger("conditional-order");

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

export async function handleConditionalOrderCreated(eventLog: Log): Promise<void> {
  const standardHandler = process.env.NEXT_PUBLIC_POLYSWAP_HANDLER;
  const negRiskHandler = process.env.NEXT_PUBLIC_POLYSWAP_HANDLER_NEGRISK;
  if (!standardHandler && !negRiskHandler) {
    log.error("no Polyswap handler configured; skipping event");
    return;
  }
  const ownHandlers = new Set(
    [standardHandler, negRiskHandler]
      .filter((h): h is string => Boolean(h))
      .map((h) => h.toLowerCase())
  );

  const decoded = decodeLog(eventLog);
  if (!decoded) return;

  if (!ownHandlers.has(decoded.params.handler.toLowerCase())) {
    log.debug(`skipping event for foreign handler ${decoded.params.handler}`);
    return;
  }

  if (
    eventLog.transactionHash === null ||
    eventLog.blockNumber === null ||
    eventLog.logIndex === null
  ) {
    log.error("event missing block/tx/index — skipping");
    return;
  }

  const orderHash = calculateOrderHash(decoded.params);
  const data = decodeStaticInput(decoded.params.staticInput as Hex);
  log.debug(`accepted owner=${decoded.owner} orderHash=${orderHash} block=${eventLog.blockNumber}`);

  try {
    await DatabaseService.upsertLiveOrderFromEvent({
      owner: decoded.owner,
      orderHash,
      handler: decoded.params.handler,
      salt: decoded.params.salt,
      data,
      transactionHash: eventLog.transactionHash,
      blockNumber: Number(eventLog.blockNumber),
      logIndex: Number(eventLog.logIndex),
    });
    log.info(`upserted live order ${orderHash} (owner ${decoded.owner})`);
  } catch (err) {
    log.error("upsertLiveOrderFromEvent failed:", err);
  }
}
