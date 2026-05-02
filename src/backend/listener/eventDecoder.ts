import { decodeAbiParameters, encodeAbiParameters, keccak256, type Hex } from "viem";
import {
  type ConditionalOrderParams,
  type PolyswapOrderData,
} from "@/backend/interfaces/PolyswapOrder";

const ORDER_DATA_TUPLE = [
  { type: "address", name: "sellToken" },
  { type: "address", name: "buyToken" },
  { type: "address", name: "receiver" },
  { type: "uint256", name: "sellAmount" },
  { type: "uint256", name: "minBuyAmount" },
  { type: "uint256", name: "t0" },
  { type: "uint256", name: "t" },
  { type: "bytes32", name: "polymarketOrderHash" },
  { type: "bytes32", name: "appData" },
] as const;

/**
 * keccak256(abi.encode((handler, salt, staticInput))) — matches ComposableCoW.hash().
 * The result is the singleOrderHash key used for remove() and on-chain singleOrders[] reads.
 */
export function calculateOrderHash(params: ConditionalOrderParams): Hex {
  const encoded = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { type: "address", name: "handler" },
          { type: "bytes32", name: "salt" },
          { type: "bytes", name: "staticInput" },
        ],
      },
    ],
    [
      {
        handler: params.handler as `0x${string}`,
        salt: params.salt as `0x${string}`,
        staticInput: params.staticInput as `0x${string}`,
      },
    ]
  );
  return keccak256(encoded);
}

/**
 * Decode the staticInput bytes blob from a ConditionalOrderCreated event into
 * PolyswapOrderData. Field order MUST match the handler's struct layout.
 */
export function decodeStaticInput(staticInput: Hex): PolyswapOrderData {
  const decoded = decodeAbiParameters(ORDER_DATA_TUPLE, staticInput);
  return {
    sellToken: decoded[0],
    buyToken: decoded[1],
    receiver: decoded[2],
    sellAmount: decoded[3].toString(),
    minBuyAmount: decoded[4].toString(),
    t0: decoded[5].toString(),
    t: decoded[6].toString(),
    polymarketOrderHash: decoded[7],
    appData: decoded[8],
  };
}
