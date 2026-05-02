import {
  type ApiKeyCreds,
  ClobClient,
  Side,
  OrderType,
  AssetType,
  type OpenOrder,
} from "@polymarket/clob-client";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  erc20Abi,
  formatUnits,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

export interface PolymarketOrderConfig {
  tokenID: string;
  price: number;
  side: "BUY" | "SELL";
  size: number;
  feeRateBps?: number;
  expiration?: number;
}

export interface PolymarketMarketOrderConfig {
  side: "BUY" | "SELL";
  tokenID: string;
  amount: number; // For BUY: amount in USD, for SELL: amount in shares
  feeRateBps?: number;
  price?: number; // Optional price limit for market orders
}

const USDC_DEFAULT: Address = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const POLYMARKET_CTF_EXCHANGE_DEFAULT: Address = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";

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
  private nonce = 0;

  private readonly USDC: Address = (process.env.USDC_ADDRESS as Address) ?? USDC_DEFAULT;
  private readonly POLYMARKET_CONTRACT: Address =
    (process.env.POLYMARKET_CONTRACT_ADDRESS as Address) ?? POLYMARKET_CTF_EXCHANGE_DEFAULT;

  private constructor() {}

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
      transport: http(rpcUrl),
    });
    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(rpcUrl),
    });

    this.nonce = Number(process.env.NONCE ?? 0);

    const creds: ApiKeyCreds = {
      key: process.env.CLOB_API_KEY ?? "",
      secret: process.env.CLOB_SECRET ?? "",
      passphrase: process.env.CLOB_PASS_PHRASE ?? "",
    };
    if (!creds.key || !creds.secret || !creds.passphrase) {
      throw new Error("CLOB API credentials are not fully set in environment variables");
    }

    const clobClient = new ClobClient(
      host,
      chainId,
      walletClient,
      creds,
      0, // signatureType — 0 = EOA
      account.address
    );

    try {
      await publicClient.getBlockNumber();
    } catch (networkError) {
      console.error("Failed to connect to Polygon network:", networkError);
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
   * Reads on-chain via viem; spender is typically the Polymarket CTF Exchange contract.
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

      const decimals = await this.getTokenDecimals(this.USDC);
      const priceBigInt = BigInt(Math.floor(config.price * 1_000_000));
      const sizeBigInt = BigInt(Math.floor(sizeToUse * 1_000_000));
      const decimalsMultiplier = BigInt(10) ** BigInt(decimals);
      const requiredAmount =
        (priceBigInt * sizeBigInt * decimalsMultiplier) / (1_000_000n * 1_000_000n);

      const ok = await this.checkAllowance(this.USDC, requiredAmount, this.POLYMARKET_CONTRACT);
      if (!ok) {
        throw new Error("Insufficient allowance for USDC");
      }
    }

    try {
      const response = await clobClient.createAndPostOrder(
        {
          tokenID: config.tokenID,
          price: config.price,
          side: config.side === "BUY" ? Side.BUY : Side.SELL,
          size: sizeToUse,
          feeRateBps: config.feeRateBps ?? 0,
        },
        { tickSize: "0.01" },
        OrderType.GTC
      );
      return { response };
    } catch (error) {
      const { message, details } = describeOrderError(error);
      console.error("Failed to create GTC order:", error);
      throw new Error(`Failed to create GTC order: ${message}. Details: ${details}`);
    }
  }

  /**
   * Create a Good Till Date (GTD) order.
   */
  async postGTDOrder(config: PolymarketOrderConfig & { expiration: number }) {
    const { clobClient } = this.getReady();

    if (!(config.price > 0)) {
      throw new Error("Price must be greater than 0");
    }

    const minSizeForOneDollar = Math.ceil((1 / config.price) * 1_000_000) / 1_000_000;
    const sizeToUse = config.size < minSizeForOneDollar ? minSizeForOneDollar : config.size;

    const decimals = await this.getTokenDecimals(this.USDC);
    const priceBigInt = BigInt(Math.floor(config.price * 1_000_000));
    const sizeBigInt = BigInt(Math.floor(sizeToUse * 1_000_000));
    const decimalsMultiplier = BigInt(10) ** BigInt(decimals);
    const requiredAmount =
      (priceBigInt * sizeBigInt * decimalsMultiplier) / (1_000_000n * 1_000_000n);

    // Refresh CLOB's internal balance/allowance cache against on-chain state.
    await clobClient.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });

    const ok = await this.checkAllowance(this.USDC, requiredAmount, this.POLYMARKET_CONTRACT);
    if (!ok) {
      throw new Error(
        `Insufficient on-chain allowance for USDC. Please approve ${formatUnits(requiredAmount, decimals)} USDC for ${this.POLYMARKET_CONTRACT}`
      );
    }

    try {
      const response = await clobClient.createAndPostOrder(
        {
          tokenID: config.tokenID,
          price: config.price,
          side: config.side === "BUY" ? Side.BUY : Side.SELL,
          size: sizeToUse,
          feeRateBps: config.feeRateBps ?? 0,
          expiration: config.expiration,
        },
        { tickSize: "0.01" },
        OrderType.GTD
      );
      return { response };
    } catch (error) {
      const { message, details } = describeOrderError(error);
      console.error("Failed to create GTD order:", error);
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
