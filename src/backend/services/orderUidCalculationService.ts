import { ethers } from 'ethers';


export interface PolyswapOrderData {
  sellToken: string;
  buyToken: string;
  receiver: string;
  sellAmount: string;
  minBuyAmount: string;
  t0: string; // start valid date (uint256)
  t: string;  // maximum date (uint256)
  polymarketOrderHash: string;
  appData: string;
}

/**
 * Service for calculating CoW Protocol order UIDs using EIP-712
 */
export class OrderUidCalculationService {
  private static provider: ethers.Provider | null = null;

  /**
   * Initialize the service with a provider
   */
  static initialize(provider: ethers.Provider): void {
    this.provider = provider;
  }


  /**
   * Calculate the order hash using the PolySwap Handler contract
   */
  static async calculateOrderHashOnChain(polyswapOrderData: PolyswapOrderData): Promise<string> {
    if (!this.provider) {
      throw new Error('OrderUidCalculationService not initialized with provider');
    }

    try {
      const polyswapHandlerAddress = process.env.NEXT_PUBLIC_POLYSWAP_HANDLER;
      if (!polyswapHandlerAddress) {
        throw new Error('NEXT_PUBLIC_POLYSWAP_HANDLER environment variable not set');
      }

      const orderHashContract = new ethers.Contract(
        polyswapHandlerAddress,
        [
          'function getOrderHash((address,address,address,uint256,uint256,uint256,uint256,bytes32,bytes32)) view returns (bytes32)'
        ],
        this.provider
      );

      const orderTuple = [
        polyswapOrderData.sellToken,
        polyswapOrderData.buyToken,
        polyswapOrderData.receiver,
        polyswapOrderData.sellAmount,
        polyswapOrderData.minBuyAmount,
        polyswapOrderData.t0,
        polyswapOrderData.t,
        polyswapOrderData.polymarketOrderHash,
        polyswapOrderData.appData
      ];

      const orderHash = await orderHashContract.getOrderHash(orderTuple);

      return orderHash;
    } catch (error) {
      console.error('❌ Error calculating order hash on-chain:', error);
      throw new Error(`Failed to calculate order hash on-chain: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  /**
   * Calculate the order UID from digest, owner, and validTo
   * According to CoW Protocol docs: orderUid = orderDigest ‖ owner ‖ validTo (concatenation, not hash)
   */
  static calculateOrderUid(orderDigest: string, owner: string, validTo: number): string {
    try {
      // Concatenate orderDigest (32 bytes) + owner (20 bytes) + validTo (4 bytes)
      // Total length: 56 bytes (0x + 112 hex chars)
      const orderUid = ethers.solidityPacked(
        ['bytes32', 'address', 'uint32'],
        [orderDigest, owner, validTo]
      );

      return orderUid;
    } catch (error) {
      console.error('❌ Error calculating order UID:', error);
      throw new Error(`Failed to calculate order UID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate the complete order UID using the PolySwap Handler contract
   */
  static async calculateCompleteOrderUidOnChain(
    polyswapOrderData: PolyswapOrderData,
    owner: string
  ): Promise<string> {
    try {
      // Step 1: Calculate the order hash using PolySwap Handler contract
      const orderHash = await this.calculateOrderHashOnChain(polyswapOrderData);

      // Step 2: Calculate the order UID
      // Use the 't' field (end time) as validTo for order UID calculation
      const validTo = parseInt(polyswapOrderData.t);
      const orderUid = this.calculateOrderUid(orderHash, owner, validTo);

      return orderUid;
    } catch (error) {
      console.error('❌ Error calculating complete order UID on-chain:', error);
      throw new Error(`Failed to calculate complete order UID on-chain: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  /**
   * Create PolyswapOrder data structure from database order record
   */
  static createPolyswapOrderDataFromDbOrder(dbOrder: any): PolyswapOrderData {
    return {
      sellToken: dbOrder.sell_token,
      buyToken: dbOrder.buy_token,
      receiver: dbOrder.owner, // In PolySwap, the receiver is typically the owner
      sellAmount: dbOrder.sell_amount.toString(),
      minBuyAmount: dbOrder.min_buy_amount.toString(),
      t0: Math.floor(new Date(dbOrder.start_time).getTime() / 1000).toString(), // Convert to Unix timestamp as string
      t: Math.floor(new Date(dbOrder.end_time).getTime() / 1000).toString(), // Convert to Unix timestamp as string
      polymarketOrderHash: dbOrder.polymarket_order_hash || '0x0000000000000000000000000000000000000000000000000000000000000000',
      appData: dbOrder.app_data || '0x0000000000000000000000000000000000000000000000000000000000000000',
    };
  }

}

export default OrderUidCalculationService;