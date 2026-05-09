import {
  type ApiKeyCreds,
  ClobClient,
  Side,
  OrderType,
  AssetType,
  SignatureTypeV2,
  type OpenOrder,
} from "@polymarket/clob-client-v2";
import {
  createPublicClient,
  createWalletClient,
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

// V2 GTD orders require a safety buffer between `now` and the requested expiration,
// otherwise the CLOB rejects them as "already expired".
const GTD_SAFETY_BUFFER_SECONDS = 60;

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
    const { clobClient } = this.getReady();

    if (!(config.price > 0)) {
      throw new Error("Price must be greater than 0");
    }

    const minSizeForOneDollar = Math.ceil((1 / config.price) * 1_000_000) / 1_000_000;
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

    try {
      const response = await clobClient.createAndPostOrder(
        {
          tokenID: config.tokenID,
          price: config.price,
          side: config.side === "BUY" ? Side.BUY : Side.SELL,
          size: sizeToUse,
          expiration,
        },
        { tickSize: "0.01", negRisk: config.negRisk },
        OrderType.GTD
      );
      log.info(`GTD response: ${JSON.stringify(response)}`);
      assertCLOBOrderAccepted(response, "GTD");
      return { response };
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
