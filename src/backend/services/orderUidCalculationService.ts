import { ethers } from 'ethers';

// GPv2Settlement contract address on Polygon
const GPV2_SETTLEMENT_ADDRESS = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';

// Order hash calculation contract address
const ORDER_HASH_CALCULATOR_ADDRESS = '0x3f4DE99433993f58dDaD05776A9DfF90974995B6';

// EIP-712 domain and types for CoW Protocol
const EIP712_DOMAIN = {
  name: 'Gnosis Protocol',
  version: 'v2',
  verifyingContract: GPV2_SETTLEMENT_ADDRESS,
};

const EIP712_TYPES = {
  Order: [
    { name: 'sellToken', type: 'address' },
    { name: 'buyToken', type: 'address' },
    { name: 'receiver', type: 'address' },
    { name: 'sellAmount', type: 'uint256' },
    { name: 'buyAmount', type: 'uint256' },
    { name: 'validTo', type: 'uint32' },
    { name: 'appData', type: 'bytes32' },
    { name: 'feeAmount', type: 'uint256' },
    { name: 'kind', type: 'string' },
    { name: 'partiallyFillable', type: 'bool' },
    { name: 'sellTokenBalance', type: 'string' },
    { name: 'buyTokenBalance', type: 'string' },
  ],
};

export interface OrderData {
  sellToken: string;
  buyToken: string;
  receiver: string;
  sellAmount: string;
  buyAmount: string;
  validTo: number;
  appData: string;
  feeAmount: string;
  kind: string;
  partiallyFillable: boolean;
  sellTokenBalance: string;
  buyTokenBalance: string;
}

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
  private static domainSeparator: string | null = null;

  /**
   * Initialize the service with a provider
   */
  static initialize(provider: ethers.Provider): void {
    this.provider = provider;
  }

  /**
   * Get the domain separator from the ComposableCoW contract
   */
  static async getDomainSeparator(): Promise<string> {
    if (this.domainSeparator) {
      return this.domainSeparator;
    }

    if (!this.provider) {
      throw new Error('OrderUidCalculationService not initialized with provider');
    }

    try {
      // Get the domain separator from the ComposableCoW contract
      const composableCowAddress = process.env.COMPOSABLE_COW;
      if (!composableCowAddress) {
        throw new Error('COMPOSABLE_COW environment variable not set');
      }

      const composableCowContract = new ethers.Contract(
        composableCowAddress,
        ['function domainSeparator() view returns (bytes32)'],
        this.provider
      );

      const domainSeparator = await composableCowContract.domainSeparator();
      this.domainSeparator = domainSeparator;

      return this.domainSeparator;
    } catch (error) {
      console.error('❌ Error getting domain separator:', error);
      throw new Error(`Failed to get domain separator: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate the order hash using the on-chain contract (preferred method)
   */
  static async calculateOrderHashOnChain(polyswapOrderData: PolyswapOrderData): Promise<string> {
    if (!this.provider) {
      throw new Error('OrderUidCalculationService not initialized with provider');
    }

    try {
      const orderHashContract = new ethers.Contract(
        ORDER_HASH_CALCULATOR_ADDRESS,
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
   * Calculate the order digest using EIP-712 (fallback method)
   */
  static async calculateOrderDigest(chainId: number, orderData: OrderData): Promise<string> {
    if (!this.provider) {
      throw new Error('OrderUidCalculationService not initialized with provider');
    }

    try {
      const domain = {
        ...EIP712_DOMAIN,
        chainId: chainId,
      };

      // Use ethers TypedDataEncoder to calculate the EIP-712 hash
      const orderDigest = ethers.TypedDataEncoder.hash(domain, EIP712_TYPES, orderData);

      return orderDigest;
    } catch (error) {
      console.error('❌ Error calculating order digest:', error);
      throw new Error(`Failed to calculate order digest: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
   * Calculate the complete order UID using on-chain contract (preferred method)
   */
  static async calculateCompleteOrderUidOnChain(
    polyswapOrderData: PolyswapOrderData,
    owner: string
  ): Promise<string> {
    try {
      // Step 1: Calculate the order hash using on-chain contract
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
   * Calculate the complete order UID from order parameters (fallback method)
   */
  static async calculateCompleteOrderUid(
    chainId: number,
    orderData: OrderData,
    owner: string
  ): Promise<string> {
    try {
      // Step 1: Calculate the order digest
      const orderDigest = await this.calculateOrderDigest(chainId, orderData);

      // Step 2: Calculate the order UID
      const orderUid = this.calculateOrderUid(orderDigest, owner, orderData.validTo);

      return orderUid;
    } catch (error) {
      console.error('❌ Error calculating complete order UID:', error);
      throw new Error(`Failed to calculate complete order UID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create PolyswapOrder data structure from database order record (preferred method)
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

  /**
   * Create order data structure from database order record (fallback method)
   */
  static createOrderDataFromDbOrder(dbOrder: any): OrderData {
    return {
      sellToken: dbOrder.sell_token,
      buyToken: dbOrder.buy_token,
      receiver: '0x0000000000000000000000000000000000000000', // Zero address as default
      sellAmount: dbOrder.sell_amount.toString(),
      buyAmount: dbOrder.min_buy_amount.toString(),
      validTo: Math.floor(new Date(dbOrder.end_time).getTime() / 1000), // Convert to Unix timestamp
      appData: dbOrder.app_data || '0x0000000000000000000000000000000000000000000000000000000000000000',
      feeAmount: '0', // Default fee amount for conditional orders
      kind: 'sell', // PolySwap orders are typically sell orders
      partiallyFillable: false, // PolySwap orders are usually not partially fillable
      sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20',
    };
  }
}

export default OrderUidCalculationService;