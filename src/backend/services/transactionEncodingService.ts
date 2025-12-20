import { ethers } from "ethers";
import { PolyswapOrderData, ConditionalOrderParams } from "../interfaces/PolyswapOrder";
import composableCowAbi from "../../abi/composableCoW.json";

export interface TransactionData {
  to: string;
  data: string;
  value: string;
  chainId: number;
}

export class TransactionEncodingService {
  private static readonly COMPOSABLE_COW_ADDRESS = process.env.COMPOSABLE_COW || "";
  private static readonly POLYSWAP_HANDLER_ADDRESS = process.env.NEXT_PUBLIC_POLYSWAP_HANDLER || "";
  private static readonly VALUE_FACTORY_ADDRESS =
    process.env.VALUE_FACTORY || "0x52eD56Da04309Aca4c3FECC595298d80C2f16BAc";
  private static readonly CHAIN_ID = parseInt(process.env.CHAIN_ID || "137");

  static encodePolyswapOrderData(orderData: PolyswapOrderData): string {
    // Validate and sanitize input data
    const sellToken = orderData.sellToken || "0x0000000000000000000000000000000000000000";
    const buyToken = orderData.buyToken || "0x0000000000000000000000000000000000000000";
    const receiver = orderData.receiver || "0x0000000000000000000000000000000000000000";
    const sellAmount = orderData.sellAmount || "0";
    const minBuyAmount = orderData.minBuyAmount || "0";
    const t0 = orderData.t0 || "0";
    const t = orderData.t || "0";
    const polymarketOrderHash =
      orderData.polymarketOrderHash ||
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    const appData =
      orderData.appData || "0x0000000000000000000000000000000000000000000000000000000000000000";

    // Validate that all required fields are present
    if (!orderData.sellToken || !orderData.buyToken || !orderData.polymarketOrderHash) {
      throw new Error(
        "Missing required order data fields: sellToken, buyToken, or polymarketOrderHash"
      );
    }

    // Ensure bytes32 fields are properly formatted
    const formatBytes32 = (value: string): string => {
      if (!value || value === "")
        return "0x0000000000000000000000000000000000000000000000000000000000000000";
      if (!value.startsWith("0x")) return "0x" + value.padStart(64, "0");
      if (value.length !== 66) return value.padEnd(66, "0");
      return value;
    };

    const types = [
      "address", // sellToken
      "address", // buyToken
      "address", // receiver
      "uint256", // sellAmount
      "uint256", // minBuyAmount
      "uint256", // t0
      "uint256", // t
      "bytes32", // polymarketOrderHash
      "bytes32", // appData
    ];

    const values = [
      sellToken,
      buyToken,
      receiver,
      sellAmount,
      minBuyAmount,
      t0,
      t,
      formatBytes32(polymarketOrderHash),
      formatBytes32(appData),
    ];

    console.log("Encoding PolyswapOrder with values:", values);

    return ethers.AbiCoder.defaultAbiCoder().encode(types, values);
  }

  static createConditionalOrderParams(
    orderData: PolyswapOrderData,
    salt?: string
  ): ConditionalOrderParams {
    // Generate salt if not provided
    const orderSalt =
      salt ||
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["string", "uint256"], ["Polyswap", Date.now()])
      );

    const staticInput = this.encodePolyswapOrderData(orderData);

    return {
      handler: this.POLYSWAP_HANDLER_ADDRESS,
      salt: orderSalt,
      staticInput: staticInput,
    };
  }

  static encodeCreateWithContextCallData(
    params: ConditionalOrderParams,
    valueFactory: string = this.VALUE_FACTORY_ADDRESS,
    data: string = "0x",
    dispatch: boolean = true
  ): string {
    const iface = new ethers.Interface(composableCowAbi);

    return iface.encodeFunctionData("createWithContext", [params, valueFactory, data, dispatch]);
  }

  static createTransaction(orderData: PolyswapOrderData, salt?: string): TransactionData {
    const params = this.createConditionalOrderParams(orderData, salt);
    const callData = this.encodeCreateWithContextCallData(params);

    return {
      to: this.COMPOSABLE_COW_ADDRESS,
      data: callData,
      value: "0",
      chainId: this.CHAIN_ID,
    };
  }

  static calculateOrderHash(params: ConditionalOrderParams): string {
    const iface = new ethers.Interface(composableCowAbi);

    // Use the hash function from the ABI to calculate the order hash
    // This matches the composableCow.hash(params) call from the Solidity example
    const types = ["address", "bytes32", "bytes"];
    const values = [params.handler, params.salt, params.staticInput];

    // Encode the params struct
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(address,bytes32,bytes)"],
      [[params.handler, params.salt, params.staticInput]]
    );

    return ethers.keccak256(encoded);
  }
}
