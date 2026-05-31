import {
  type ApiKeyCreds,
  ClobClient,
  Side,
  OrderType,
  AssetType,
  SignatureTypeV2,
  type OpenOrder,
  type SignedOrder,
  isV2Order,
} from "@polymarket/clob-client-v2";
import {
  createPublicClient,
  createWalletClient,
  hashTypedData,
  isAddress,
  erc20Abi,
  formatUnits,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { resilientHttp } from "@/lib/rpc/resilientHttp";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createLogger } from "../logger";

const log = createLogger("polymarket-order");

export interface PolymarketOrderConfig {
  tokenID: string;
  price: number;
  side: "BUY" | "SELL";
  size: number;
  feeRateBps?: number;
  expiration?: number;
  negRisk?: boolean;
}

export interface PolymarketMarketOrderConfig {
  side: "BUY" | "SELL";
  tokenID: string;
  amount: number; // For BUY: amount in USD, for SELL: amount in shares
  feeRateBps?: number;
  price?: number; // Optional price limit for market orders
}

// V2 collateral is pUSD (a 1:1 wrapper around USDC.e), not USDC.e directly.
const PUSD_DEFAULT: Address = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const CTF_EXCHANGE_V2_DEFAULT: Address = "0xE111180000d2663C0091e4f400237545B87B996B";
const NEG_RISK_CTF_EXCHANGE_V2_DEFAULT: Address = "0xe2222d279d744050d28e00520010520000310F59";

// V2 GTD orders require a safety buffer between `now` and the requested expiration,
// otherwise the CLOB rejects them as "already expired".
const GTD_SAFETY_BUFFER_SECONDS = 60;

const POLYGON_CHAIN_ID = 137;
// How many times to regenerate the order (fresh salt) if its hash already has on-chain status.
const MAX_SALT_ATTEMPTS = 3;

// EIP-712 Order struct of the V2 CTF Exchange; the plain digest over it is the orderID getOrderStatus keys on.
const ORDER_STRUCT_V2 = [
  { name: "salt", type: "uint256" },
  { name: "maker", type: "address" },
  { name: "signer", type: "address" },
  { name: "tokenId", type: "uint256" },
  { name: "makerAmount", type: "uint256" },
  { name: "takerAmount", type: "uint256" },
  { name: "side", type: "uint8" },
  { name: "signatureType", type: "uint8" },
  { name: "timestamp", type: "uint256" },
  { name: "metadata", type: "bytes32" },
  { name: "builder", type: "bytes32" },
] as const;

const ORDER_STATUS_ABI = [
  {
    type: "function",
    name: "getOrderStatus",
    stateMutability: "view",
    inputs: [{ type: "bytes32", name: "orderHash" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "isFilledOrCancelled", type: "bool" },
          { name: "remaining", type: "uint256" },
        ],
      },
    ],
  },
] as const;

// Compute a V2 order's hash off-chain (== the CLOB orderID) so we can check getOrderStatus before posting.
export function computeV2OrderHash(order: SignedOrder, exchange: Address): Hex {
  if (!isV2Order(order)) {
    throw new Error("expected a V2 signed order");
  }
  return hashTypedData({
    domain: {
      name: "Polymarket CTF Exchange",
      version: "2",
      chainId: POLYGON_CHAIN_ID,
      verifyingContract: exchange,
    },
    types: { Order: ORDER_STRUCT_V2 },
    primaryType: "Order",
    message: {
      salt: BigInt(order.salt),
      maker: order.maker as Address,
      signer: order.signer as Address,
      tokenId: BigInt(order.tokenId),
      makerAmount: BigInt(order.makerAmount),
      takerAmount: BigInt(order.takerAmount),
      side: order.side === Side.BUY ? 0 : 1,
      signatureType: Number(order.signatureType),
      timestamp: BigInt(order.timestamp),
      metadata: order.metadata as Hex,
      builder: order.builder as Hex,
    },
  });
}

interface ReadyClients {
  clobClient: ClobClient;
  publicClient: PublicClient;
  walletClient: WalletClient;
  ownerAddress: Address;
}

let polymarketOrderServiceInstance: PolymarketOrderService | null = null;
let initializationPromise: Promise<void> | null = null;

export class PolymarketOrderService {
  private ready: ReadyClients | null = null;

  private readonly PUSD: Address = (process.env.PUSD_ADDRESS as Address) ?? PUSD_DEFAULT;
  private readonly CTF_EXCHANGE: Address =
    (process.env.CTF_EXCHANGE_V2_ADDRESS as Address) ?? CTF_EXCHANGE_V2_DEFAULT;
  private readonly NEG_RISK_CTF_EXCHANGE: Address =
    (process.env.NEG_RISK_CTF_EXCHANGE_V2_ADDRESS as Address) ?? NEG_RISK_CTF_EXCHANGE_V2_DEFAULT;

  private constructor() {
    /* singleton — see getInstance() */
  }

  public static getInstance(): PolymarketOrderService {
    if (!polymarketOrderServiceInstance) {
      polymarketOrderServiceInstance = new PolymarketOrderService();
    }
    return polymarketOrderServiceInstance;
  }

  public async initialize(): Promise<void> {
    if (this.ready) return;
    if (initializationPromise) return initializationPromise;

    initializationPromise = this.performInitialization();
    try {
      await initializationPromise;
    } catch (error) {
      initializationPromise = null;
      throw error;
    }
  }

  private async performInitialization(): Promise<void> {
    const host = process.env.CLOB_API_URL ?? "https://clob.polymarket.com";
    const chainId = Number(process.env.CHAIN_ID ?? polygon.id);
    const rpcUrl = process.env.RPC_URL ?? "https://polygon-rpc.com";

    const pk = process.env.PK;
    if (!pk) {
      throw new Error("Private key (PK) is not set in environment variables");
    }
    const privateKey: Hex = (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex;

    const account = privateKeyToAccount(privateKey);

    const publicClient = createPublicClient({
      chain: polygon,
      transport: resilientHttp(rpcUrl),
    });
    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: resilientHttp(rpcUrl),
    });

    const creds: ApiKeyCreds = {
      key: process.env.CLOB_API_KEY ?? "",
      secret: process.env.CLOB_SECRET ?? "",
      passphrase: process.env.CLOB_PASS_PHRASE ?? "",
    };
    if (!creds.key || !creds.secret || !creds.passphrase) {
      throw new Error("CLOB API credentials are not fully set in environment variables");
    }

    const clobClient = new ClobClient({
      host,
      chain: chainId,
      signer: walletClient,
      creds,
      signatureType: SignatureTypeV2.EOA,
    });

    try {
      await publicClient.getBlockNumber();
    } catch (networkError) {
      log.error("failed to connect to Polygon network:", networkError);
      throw new Error(`Failed to connect to Polygon network: ${networkError}`);
    }

    this.ready = {
      clobClient,
      publicClient,
      walletClient,
      ownerAddress: account.address,
    };
  }

  /**
   * Returns the initialized clients, throwing if `initialize()` hasn't completed.
   * Callers should destructure what they need rather than reaching through `this`.
   */
  private getReady(): ReadyClients {
    if (!this.ready) {
      throw new Error("PolymarketOrderService not initialized. Call initialize() first.");
    }
    return this.ready;
  }

  /**
   * Check if the token allowance is sufficient for the required amount.
   * Reads on-chain via viem; spender is typically the V2 CTF Exchange contract.
   */
  private async checkAllowance(
    token: Address,
    requiredAmount: bigint,
    spender: Address
  ): Promise<boolean> {
    const { publicClient, ownerAddress } = this.getReady();
    if (!isAddress(token)) {
      throw new Error(`Invalid token address: ${token}`);
    }

    const currentAllowance = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [ownerAddress, spender],
    });

    return currentAllowance >= requiredAmount;
  }

  private async getTokenDecimals(token: Address): Promise<number> {
    const { publicClient } = this.getReady();
    if (!isAddress(token)) {
      throw new Error(`Invalid token address: ${token}`);
    }

    return publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    });
  }

  async cancelAllOrders() {
    const { clobClient } = this.getReady();
    return clobClient.cancelAll();
  }

  async cancelOrder(orderId: string) {
    const { clobClient } = this.getReady();
    return clobClient.cancelOrder({ orderID: orderId });
  }

  async getOrder(id: string) {
    const { clobClient } = this.getReady();
    return clobClient.getOrder(id);
  }

  /**
   * Get all open orders for the authenticated user.
   */
  async getOpenOrders(params: { market?: string; asset_id?: string } = {}): Promise<OpenOrder[]> {
    const { clobClient } = this.getReady();
    return clobClient.getOpenOrders(params);
  }

  /**
   * Get all active BUY orders, optionally filtered by market.
   */
  async getActiveBuyOrders(marketId?: string): Promise<OpenOrder[]> {
    const orders = await this.getOpenOrders(marketId ? { market: marketId } : {});
    return orders.filter((order) => order.side === "BUY");
  }

  /**
   * Create a Good Till Cancelled (GTC) order.
   */
  async postGTCOrder(config: PolymarketOrderConfig) {
    const { clobClient } = this.getReady();

    if (!(config.price > 0)) {
      throw new Error("Price must be greater than 0");
    }

    // For BUY orders: ensure order notional (price * size) is at least $1.
    // For SELL orders: use the exact size provided (no minimum).
    let sizeToUse = config.size;
    if (config.side === "BUY") {
      const minSizeForOneDollar = Math.ceil((1 / config.price) * 1_000_000) / 1_000_000;
      sizeToUse = config.size < minSizeForOneDollar ? minSizeForOneDollar : config.size;

      const decimals = await this.getTokenDecimals(this.PUSD);
      const priceBigInt = BigInt(Math.floor(config.price * 1_000_000));
      const sizeBigInt = BigInt(Math.floor(sizeToUse * 1_000_000));
      const decimalsMultiplier = BigInt(10) ** BigInt(decimals);
      const requiredAmount =
        (priceBigInt * sizeBigInt * decimalsMultiplier) / (1_000_000n * 1_000_000n);

      const ok = await this.checkAllowance(this.PUSD, requiredAmount, this.CTF_EXCHANGE);
      if (!ok) {
        throw new Error("Insufficient allowance for pUSD");
      }
    }

    try {
      const response = await clobClient.createAndPostOrder(
        {
          tokenID: config.tokenID,
          price: config.price,
          side: config.side === "BUY" ? Side.BUY : Side.SELL,
          size: sizeToUse,
        },
        { tickSize: "0.01", negRisk: config.negRisk },
        OrderType.GTC
      );
      log.info(`GTC response: ${JSON.stringify(response)}`);
      assertCLOBOrderAccepted(response, "GTC");
      return { response };
    } catch (error) {
      const { message, details } = describeOrderError(error);
      log.error("failed to create GTC order:", error);
      throw new Error(`Failed to create GTC order: ${message}. Details: ${details}`);
    }
  }

  /**
   * Create a Good Till Date (GTD) order.
   *
   * V2 requires a 60-second safety buffer between `now` and the order's `expiration`,
   * otherwise the CLOB rejects the order as already-expired (memory `3036`). We bump
   * the caller-supplied expiration up to that floor when needed, never down.
   */
  async postGTDOrder(config: PolymarketOrderConfig & { expiration: number }) {
    const { clobClient, publicClient } = this.getReady();

    if (!(config.price > 0)) {
      throw new Error("Price must be greater than 0");
    }

    // The SDK rounds BUY size DOWN to 2 dp and the CLOB rejects marketable BUYs worth < $1; size up
    // to the smallest 2-dp size clearing $1 (+1c cushion so exact-dollar prices survive the rounding).
    const minSizeForOneDollar = Math.ceil((1.01 / config.price) * 100) / 100;
    const sizeToUse = config.size < minSizeForOneDollar ? minSizeForOneDollar : config.size;

    const decimals = await this.getTokenDecimals(this.PUSD);
    const priceBigInt = BigInt(Math.floor(config.price * 1_000_000));
    const sizeBigInt = BigInt(Math.floor(sizeToUse * 1_000_000));
    const decimalsMultiplier = BigInt(10) ** BigInt(decimals);
    const requiredAmount =
      (priceBigInt * sizeBigInt * decimalsMultiplier) / (1_000_000n * 1_000_000n);

    // Refresh CLOB's internal balance/allowance cache against on-chain state.
    await clobClient.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });

    const ok = await this.checkAllowance(this.PUSD, requiredAmount, this.CTF_EXCHANGE);
    if (!ok) {
      throw new Error(
        `Insufficient on-chain allowance for pUSD. Please approve ${formatUnits(requiredAmount, decimals)} pUSD for ${this.CTF_EXCHANGE}`
      );
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const minExpiration = nowSeconds + GTD_SAFETY_BUFFER_SECONDS;
    const expiration = Math.max(config.expiration, minExpiration);

    const exchange = config.negRisk ? this.NEG_RISK_CTF_EXCHANGE : this.CTF_EXCHANGE;

    try {
      // Confirm the hash is clean on-chain before posting; a reused hash carries stale getOrderStatus
      // that would poison the fill gate. Each createOrder yields a fresh salt, so retry on collision.
      let signedOrder: SignedOrder | null = null;
      let orderHash: Hex | null = null;
      for (let attempt = 0; attempt < MAX_SALT_ATTEMPTS; attempt++) {
        const candidate = await clobClient.createOrder(
          {
            tokenID: config.tokenID,
            price: config.price,
            side: config.side === "BUY" ? Side.BUY : Side.SELL,
            size: sizeToUse,
            expiration,
          },
          { tickSize: "0.01", negRisk: config.negRisk }
        );
        const hash = computeV2OrderHash(candidate, exchange);
        const status = await publicClient.readContract({
          address: exchange,
          abi: ORDER_STATUS_ABI,
          functionName: "getOrderStatus",
          args: [hash],
        });
        if (status.remaining === 0n && status.isFilledOrCancelled === false) {
          signedOrder = candidate;
          orderHash = hash;
          break;
        }
        log.warn(
          `Polymarket order hash ${hash} already has on-chain status (filled=${status.isFilledOrCancelled}, remaining=${status.remaining}); regenerating salt (${attempt + 1}/${MAX_SALT_ATTEMPTS})`
        );
      }

      if (!signedOrder || !orderHash) {
        throw new Error(
          `Could not obtain a clean Polymarket order hash after ${MAX_SALT_ATTEMPTS} attempts`
        );
      }

      const makerAmount = isV2Order(signedOrder) ? signedOrder.makerAmount : null;
      if (!makerAmount) {
        throw new Error("signed order is missing makerAmount");
      }

      const response = await clobClient.postOrder(signedOrder, OrderType.GTD);
      log.info(`GTD response: ${JSON.stringify(response)}`);
      assertCLOBOrderAccepted(response, "GTD");

      // Self-verify the off-chain hash replication against the CLOB's authoritative orderID.
      if (response.orderID && response.orderID.toLowerCase() !== orderHash.toLowerCase()) {
        log.error(
          `computed order hash ${orderHash} != response.orderID ${response.orderID} — hashing replication drift`
        );
      }

      return { response, makerAmount, polymarketOrderHash: response.orderID ?? orderHash };
    } catch (error) {
      const { message, details } = describeOrderError(error);
      log.error("failed to create GTD order:", error);
      throw new Error(`Failed to create GTD order: ${message}. Details: ${details}`);
    }
  }

  getClient(): ClobClient | null {
    return this.ready?.clobClient ?? null;
  }

  isReady(): boolean {
    return this.ready !== null;
  }
}

export const getPolymarketOrderService = (): PolymarketOrderService =>
  PolymarketOrderService.getInstance();

/**
 * V2 CLOB returns OrderResponse soft-failures ({ success: false, errorMsg, orderID: "" })
 * without throwing. Surface the real reason instead of letting an empty orderID propagate
 * as a generic "no order ID" error.
 */
function assertCLOBOrderAccepted(response: unknown, kind: "GTC" | "GTD"): void {
  if (!response || typeof response !== "object") {
    throw new Error(`${kind} order: empty response from CLOB`);
  }
  const r = response as { success?: unknown; errorMsg?: unknown; orderID?: unknown };
  if (r.success === false) {
    const reason =
      typeof r.errorMsg === "string" && r.errorMsg.length > 0 ? r.errorMsg : "rejected";
    throw new Error(`${kind} order rejected by CLOB: ${reason}`);
  }
  if (typeof r.orderID !== "string" || r.orderID.length === 0) {
    throw new Error(`${kind} order: CLOB returned no orderID (raw: ${JSON.stringify(response)})`);
  }
}

/**
 * Extract a human-readable message + structured details from a clob-client error.
 * Errors thrown by the SDK may be axios-shaped (response.data) or plain Error.
 */
function describeOrderError(error: unknown): { message: string; details: string } {
  if (error instanceof Error) {
    const maybeAxios = error as Error & {
      response?: { data?: unknown };
      stack?: string;
    };
    const detailsObj = maybeAxios.response?.data ?? maybeAxios.stack ?? "No additional details";
    return {
      message: error.message,
      details: typeof detailsObj === "string" ? detailsObj : JSON.stringify(detailsObj),
    };
  }
  return { message: String(error), details: "No additional details" };
}
