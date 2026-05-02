import { encodeAbiParameters, encodeFunctionData, keccak256, type Address, type Hex } from "viem";
import { type PolyswapOrderData, type ConditionalOrderParams } from "../interfaces/PolyswapOrder";
import composableCowAbi from "../../abi/composableCoW.json";

export interface TransactionData {
  to: string;
  data: string;
  value: string;
  chainId: number;
}

// Canonical Polygon ComposableCoW deployment address
const COMPOSABLE_COW_ADDRESS: Address =
  (process.env.COMPOSABLE_COW as Address | undefined) ??
  "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";

const VALUE_FACTORY_ADDRESS: Address =
  (process.env.VALUE_FACTORY as Address | undefined) ??
  "0x52eD56Da04309Aca4c3FECC595298d80C2f16BAc";

const CHAIN_ID = parseInt(process.env.CHAIN_ID ?? "137");

function getPolyswapHandlerAddress(): Address {
  const addr = process.env.NEXT_PUBLIC_POLYSWAP_HANDLER;
  if (!addr) {
    throw new Error(
      "NEXT_PUBLIC_POLYSWAP_HANDLER env var is required but not set. " +
        "An empty handler address would produce silently broken calldata."
    );
  }
  return addr as Address;
}

// Normalise a hex string to a valid bytes32 Hex value.
// On-chain the polymarketOrderHash and appData are bytes32 slots, so they
// must be exactly 32 bytes (66 hex chars including the 0x prefix).
function formatBytes32(value: string): Hex {
  if (!value || value === "") {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }
  const stripped = value.startsWith("0x") ? value.slice(2) : value;
  return `0x${stripped.padStart(64, "0")}` as Hex;
}

export class TransactionEncodingService {
  static encodePolyswapOrderData(orderData: PolyswapOrderData): Hex {
    if (!orderData.sellToken || !orderData.buyToken || !orderData.polymarketOrderHash) {
      throw new Error(
        "Missing required order data fields: sellToken, buyToken, or polymarketOrderHash"
      );
    }

    const sellToken = (orderData.sellToken ||
      "0x0000000000000000000000000000000000000000") as Address;
    const buyToken = (orderData.buyToken ||
      "0x0000000000000000000000000000000000000000") as Address;
    const receiver = (orderData.receiver ||
      "0x0000000000000000000000000000000000000000") as Address;

    // Field order must exactly match the on-chain PolyswapOrderData struct layout.
    return encodeAbiParameters(
      [
        { type: "address" }, // sellToken
        { type: "address" }, // buyToken
        { type: "address" }, // receiver
        { type: "uint256" }, // sellAmount
        { type: "uint256" }, // minBuyAmount
        { type: "uint256" }, // t0
        { type: "uint256" }, // t
        { type: "bytes32" }, // polymarketOrderHash
        { type: "bytes32" }, // appData
      ],
      [
        sellToken,
        buyToken,
        receiver,
        BigInt(orderData.sellAmount || "0"),
        BigInt(orderData.minBuyAmount || "0"),
        BigInt(orderData.t0 || "0"),
        BigInt(orderData.t || "0"),
        formatBytes32(orderData.polymarketOrderHash),
        formatBytes32(
          orderData.appData || "0x0000000000000000000000000000000000000000000000000000000000000000"
        ),
      ]
    );
  }

  static createConditionalOrderParams(
    orderData: PolyswapOrderData,
    salt?: string
  ): ConditionalOrderParams {
    const orderSalt =
      salt ??
      keccak256(
        encodeAbiParameters(
          [{ type: "string" }, { type: "uint256" }],
          ["Polyswap", BigInt(Date.now())]
        )
      );

    const staticInput = this.encodePolyswapOrderData(orderData);

    return {
      handler: getPolyswapHandlerAddress(),
      salt: orderSalt,
      staticInput,
    };
  }

  static encodeCreateWithContextCallData(
    params: ConditionalOrderParams,
    valueFactory: string = VALUE_FACTORY_ADDRESS,
    data: string = "0x",
    dispatch: boolean = true
  ): Hex {
    return encodeFunctionData({
      abi: composableCowAbi,
      functionName: "createWithContext",
      args: [params, valueFactory, data, dispatch],
    });
  }

  static createTransaction(orderData: PolyswapOrderData, salt?: string): TransactionData {
    const params = this.createConditionalOrderParams(orderData, salt);
    const callData = this.encodeCreateWithContextCallData(params);

    return {
      to: COMPOSABLE_COW_ADDRESS,
      data: callData,
      value: "0",
      chainId: CHAIN_ID,
    };
  }

  static calculateOrderHash(params: ConditionalOrderParams): Hex {
    // Encodes ConditionalOrderParams as a tuple matching the on-chain struct:
    // struct ConditionalOrderParams { address handler; bytes32 salt; bytes staticInput; }
    const encoded = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "handler", type: "address" },
            { name: "salt", type: "bytes32" },
            { name: "staticInput", type: "bytes" },
          ],
        },
      ],
      [
        {
          handler: params.handler as Address,
          salt: params.salt as Hex,
          staticInput: params.staticInput as Hex,
        },
      ]
    );

    return keccak256(encoded);
  }
}
