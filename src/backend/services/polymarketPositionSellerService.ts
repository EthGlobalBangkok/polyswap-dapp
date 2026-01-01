import { ethers } from "ethers";
import { AssetType } from "@polymarket/clob-client";
import { getPolymarketOrderService } from "./polymarketOrderService";
import { DatabaseService } from "./databaseService";

// Polymarket Data API endpoint for positions
const POSITIONS_API_URL = "https://data-api.polymarket.com/positions";

// Contract addresses on Polygon for CTF (Conditional Token Framework)
// See: https://docs.polymarket.com/developers/CTF/deployment-resources
const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC on Polygon (6 decimals)
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"; // Conditional Token Framework (ERC1155)
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"; // CTFExchange
const NEG_RISK_CTF_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a"; // NegRiskCtfExchange
const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296"; // NegRiskAdapter

// ERC1155 ABI for approval and balance checking
const ERC1155_ABI = [
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
];

// ERC20 ABI for USDC approval
const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// Position interface matching Polymarket API response
interface PolymarketPosition {
  proxyWallet: string;
  asset: string; // This is the tokenId
  conditionId: string;
  size: number; // This is the quantity
  avgPrice: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  curPrice: number; // Current price
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string; // Outcome name (Yes/No)
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string;
  negativeRisk: boolean;
}

/**
 * Service to automatically sell Polymarket positions
 * This prevents the system from holding risk after BUY orders are executed
 */
export class PolymarketPositionSellerService {
  private static sellInterval: NodeJS.Timeout | null = null;
  private static isSelling = false;
  private static ownerAddress: string | null = null;
  private static wallet: ethers.Wallet | null = null;
  private static provider: ethers.JsonRpcProvider | null = null;
  private static ctfApproved = false;

  /**
   * Initialize the service and derive owner address from private key
   */
  private static async initialize(): Promise<void> {
    if (this.ownerAddress && this.wallet && this.provider) return;

    const pk = process.env.PK;
    if (!pk) {
      throw new Error("Private key (PK) is not set in environment variables");
    }

    const rpcUrl = process.env.RPC_URL || "https://polygon-rpc.com";
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    const privateKey = pk.startsWith("0x") ? pk : `0x${pk}`;
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.ownerAddress = this.wallet.address;

    console.log(`[PositionSeller] Initialized with address: ${this.ownerAddress}`);

    // Clean up any failed sold position records from previous runs
    await DatabaseService.cleanupFailedSoldPositions();

    // Ensure CTF tokens are approved for selling
    await this.ensureCTFApproval();
  }

  /**
   * Check and approve CTF tokens for all Polymarket exchange contracts
   * This is required to be able to SELL positions
   */
  private static async ensureCTFApproval(): Promise<void> {
    if (this.ctfApproved || !this.wallet || !this.ownerAddress) return;

    console.log("[PositionSeller] Checking CTF token approvals...");

    // All positions use the main CTF contract (ERC1155)
    // The NegRisk system uses the same CTF contract but with different exchange contracts
    const operators = [
      { name: "CTFExchange", address: CTF_EXCHANGE },
      { name: "NegRiskCtfExchange", address: NEG_RISK_CTF_EXCHANGE },
      { name: "NegRiskAdapter", address: NEG_RISK_ADAPTER },
    ];

    const ctfContract = new ethers.Contract(CTF_ADDRESS, ERC1155_ABI, this.wallet);
    let allApproved = true;

    for (const operator of operators) {
      try {
        const isApproved = await ctfContract.isApprovedForAll(this.ownerAddress, operator.address);

        if (isApproved) {
          console.log(`[PositionSeller] ✅ CTF already approved for ${operator.name}`);
        } else {
          console.log(`[PositionSeller] Approving CTF for ${operator.name}...`);
          const tx = await ctfContract.setApprovalForAll(operator.address, true);
          console.log(`[PositionSeller] TX: ${tx.hash}`);
          await tx.wait();
          console.log(`[PositionSeller] ✅ CTF approved for ${operator.name}`);
        }
      } catch (error: any) {
        console.error(`[PositionSeller] Error approving CTF for ${operator.name}:`, error.message);
        allApproved = false;
      }
    }

    // Also ensure USDC is approved for CTF contract (required for settlements)
    await this.ensureUSDCApproval();

    this.ctfApproved = allApproved;
    if (allApproved) {
      console.log("[PositionSeller] ✅ All CTF approvals verified");

      // Sync the CLOB's view of our balance/allowance with on-chain state
      await this.syncCLOBAllowance();
    } else {
      console.warn("[PositionSeller] ⚠️ Some CTF approvals may have failed - selling may not work");
    }
  }

  /**
   * Ensure USDC is approved for the CTF contract (required by Polymarket)
   */
  private static async ensureUSDCApproval(): Promise<void> {
    if (!this.wallet || !this.ownerAddress) return;

    console.log("[PositionSeller] Checking USDC approvals...");

    const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, this.wallet);
    const maxApproval = ethers.MaxUint256;

    // Contracts that need USDC approval
    const spenders = [
      { name: "CTF Contract", address: CTF_ADDRESS },
      { name: "CTFExchange", address: CTF_EXCHANGE },
      { name: "NegRiskCtfExchange", address: NEG_RISK_CTF_EXCHANGE },
      { name: "NegRiskAdapter", address: NEG_RISK_ADAPTER },
    ];

    for (const spender of spenders) {
      try {
        const currentAllowance = await usdcContract.allowance(this.ownerAddress, spender.address);

        if (currentAllowance > 0n) {
          continue; // Already approved
        }

        console.log(`[PositionSeller] Approving USDC for ${spender.name}...`);
        const tx = await usdcContract.approve(spender.address, maxApproval);
        console.log(`[PositionSeller] TX: ${tx.hash}`);
        await tx.wait();
        console.log(`[PositionSeller] ✅ USDC approved for ${spender.name}`);
      } catch (error: any) {
        console.error(`[PositionSeller] Error approving USDC for ${spender.name}:`, error.message);
      }
    }
  }

  /**
   * Sync the CLOB's internal balance/allowance with on-chain state
   * This is required after approving CTF tokens
   */
  private static async syncCLOBAllowance(): Promise<void> {
    try {
      console.log("[PositionSeller] Syncing CLOB balance/allowance with on-chain state...");

      const polymarketService = getPolymarketOrderService();
      await polymarketService.initialize();

      const client = polymarketService.getClient();
      if (!client) {
        console.warn("[PositionSeller] Could not get CLOB client for sync");
        return;
      }

      // Check current balance/allowance for conditional tokens
      try {
        const conditionalStatus = await client.getBalanceAllowance({
          asset_type: AssetType.CONDITIONAL,
        });
        console.log(
          `[PositionSeller] Conditional tokens - Balance: ${conditionalStatus.balance}, Allowance: ${conditionalStatus.allowance}`
        );
      } catch (e: any) {
        console.log(`[PositionSeller] Could not check conditional balance: ${e.message}`);
      }

      // Check current balance/allowance for collateral (USDC)
      try {
        const collateralStatus = await client.getBalanceAllowance({
          asset_type: AssetType.COLLATERAL,
        });
        console.log(
          `[PositionSeller] Collateral (USDC) - Balance: ${collateralStatus.balance}, Allowance: ${collateralStatus.allowance}`
        );
      } catch (e: any) {
        console.log(`[PositionSeller] Could not check collateral balance: ${e.message}`);
      }

      console.log("[PositionSeller] ✅ CLOB balance/allowance checked");
    } catch (error: any) {
      console.warn("[PositionSeller] Warning: Failed to sync CLOB allowance:", error.message);
    }
  }

  /**
   * Check the on-chain CTF token balance for a specific token ID
   */
  private static async getOnChainBalance(tokenId: string): Promise<bigint> {
    if (!this.provider || !this.ownerAddress) {
      return 0n;
    }

    try {
      const ctfContract = new ethers.Contract(CTF_ADDRESS, ERC1155_ABI, this.provider);
      const balance = await ctfContract.balanceOf(this.ownerAddress, tokenId);
      return balance;
    } catch (error: any) {
      console.error(`[PositionSeller] Error checking on-chain balance:`, error.message);
      return 0n;
    }
  }

  /**
   * Start the position selling routine with specified interval
   * @param intervalMinutes Interval in minutes (default: 5)
   */
  static async startSellRoutine(intervalMinutes: number = 5): Promise<void> {
    if (this.sellInterval) {
      console.log("[PositionSeller] Sell routine already running");
      return;
    }

    try {
      await this.initialize();
    } catch (error) {
      console.error("[PositionSeller] Failed to initialize:", error);
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    console.log(
      `[PositionSeller] Starting position sell routine (${intervalMinutes} min interval)`
    );

    // Run immediately on start
    this.checkAndSellPositions();

    // Then run on interval
    this.sellInterval = setInterval(() => {
      this.checkAndSellPositions();
    }, intervalMs);
  }

  /**
   * Stop the position selling routine
   */
  static stopSellRoutine(): void {
    if (this.sellInterval) {
      clearInterval(this.sellInterval);
      this.sellInterval = null;
      console.log("[PositionSeller] Sell routine stopped");
    }
  }

  /**
   * Fetch positions from Polymarket API
   */
  private static async fetchPositions(): Promise<PolymarketPosition[]> {
    if (!this.ownerAddress) {
      throw new Error("Owner address not initialized");
    }

    try {
      const url = `${POSITIONS_API_URL}?user=${this.ownerAddress}`;
      const response = await fetch(url, { method: "GET" });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[PositionSeller] API error: ${errorText}`);
        throw new Error(`Failed to fetch positions: ${response.status}`);
      }

      const positions: PolymarketPosition[] = await response.json();
      return positions;
    } catch (error) {
      console.error("[PositionSeller] Error fetching positions:", error);
      throw error;
    }
  }

  /**
   * Get open SELL orders from the CLOB to avoid creating duplicates
   * This replaces the database-based "recently sold" check
   */
  private static async getOpenSellOrderTokenIds(): Promise<Set<string>> {
    const tokenIds = new Set<string>();

    try {
      const polymarketService = getPolymarketOrderService();
      await polymarketService.initialize();

      const client = polymarketService.getClient();
      if (!client) return tokenIds;

      const openOrders = await client.getOpenOrders({});

      // Filter for SELL orders and extract token IDs
      for (const order of openOrders) {
        if (order.side === "SELL") {
          tokenIds.add(order.asset_id);
        }
      }

      console.log(`[PositionSeller] Found ${tokenIds.size} tokens with open SELL orders`);
    } catch (error: any) {
      console.warn(`[PositionSeller] Could not fetch open orders: ${error.message}`);
    }

    return tokenIds;
  }

  /**
   * Check for open positions and sell them
   * This version relies ONLY on API and blockchain data, NOT the database
   */
  static async checkAndSellPositions(): Promise<void> {
    if (this.isSelling) {
      console.log("[PositionSeller] Already selling, skipping...");
      return;
    }

    this.isSelling = true;
    const startTime = Date.now();

    try {
      console.log("[PositionSeller] Checking for positions to sell...");

      // Initialize the Polymarket order service first
      const polymarketService = getPolymarketOrderService();
      await polymarketService.initialize();

      if (!polymarketService.isReady()) {
        throw new Error("Polymarket service is not ready");
      }

      // Get tokens that already have open SELL orders (from CLOB API, not database)
      const tokensWithOpenSellOrders = await this.getOpenSellOrderTokenIds();

      // Fetch current positions from Polymarket API
      const positions = await this.fetchPositions();
      console.log(`[PositionSeller] Positions API returned ${positions.length} position(s)`);

      // Also scan on-chain for CTF token balances that might not be in the API yet
      // This catches recently filled orders that haven't been indexed
      const onChainPositions = await this.scanOnChainPositions();
      console.log(`[PositionSeller] On-chain scan found ${onChainPositions.length} position(s)`);

      // Merge positions - use on-chain data as source of truth for balances
      const allPositions = this.mergePositions(positions, onChainPositions);

      if (allPositions.length === 0) {
        console.log("[PositionSeller] No positions found");
        return;
      }

      console.log(`[PositionSeller] Total unique positions to process: ${allPositions.length}`);

      let soldCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      for (const position of allPositions) {
        try {
          // Skip if no shares to sell
          if (position.size <= 0) {
            console.log(`[PositionSeller] Skipping ${position.outcome}: No shares`);
            skippedCount++;
            continue;
          }

          // Skip if price is zero (can't sell) - but only if we got price from API
          if (position.curPrice <= 0 && position.fromAPI) {
            console.log(`[PositionSeller] Skipping ${position.outcome}: Price is zero`);
            skippedCount++;
            continue;
          }

          // Skip if there's already an open SELL order for this token (from CLOB API)
          if (tokensWithOpenSellOrders.has(position.asset)) {
            console.log(
              `[PositionSeller] Skipping ${position.outcome}: Already has open SELL order`
            );
            skippedCount++;
            continue;
          }

          // Get the actual on-chain balance
          const onChainBalance = await this.getOnChainBalance(position.asset);
          const onChainBalanceNum = Number(onChainBalance) / 1e6; // CTF tokens have 6 decimals

          if (onChainBalance === 0n) {
            console.log(
              `[PositionSeller] Skipping ${position.outcome}: No on-chain balance (API shows ${position.size})`
            );
            skippedCount++;
            continue;
          }

          // Calculate sell price - use current price if available, otherwise try to get from orderbook
          let sellPrice: number;
          if (position.curPrice > 0) {
            sellPrice = Math.max(0.01, position.curPrice * 0.95);
          } else {
            // Try to get price from orderbook
            const midPrice = await this.getMidpointPrice(position.asset);
            if (midPrice <= 0) {
              console.log(
                `[PositionSeller] Skipping ${position.outcome}: Could not determine price`
              );
              skippedCount++;
              continue;
            }
            sellPrice = Math.max(0.01, midPrice * 0.95);
          }

          // Use the on-chain balance
          const sizeToSell = onChainBalanceNum;

          console.log(
            `[PositionSeller] Selling ${sizeToSell.toFixed(2)} shares of "${position.outcome}" at $${sellPrice.toFixed(3)}`
          );

          // Create the sell order
          const orderResult = await polymarketService.postGTCOrder({
            tokenID: position.asset,
            price: sellPrice,
            side: "SELL",
            size: sizeToSell,
          });

          // Verify the order was actually created successfully
          const orderId = orderResult.response?.orderID;

          if (!orderId || orderId === "unknown") {
            console.error(
              `[PositionSeller] ❌ Failed to create sell order for ${position.outcome} - no order ID returned`
            );
            errorCount++;
            continue;
          }

          console.log(`[PositionSeller] ✅ Sell order created: ${orderId}`);

          // Record in database for audit purposes only (not used for deduplication)
          try {
            await DatabaseService.recordSoldPosition({
              assetId: position.asset,
              conditionId: position.conditionId || "",
              size: sizeToSell,
              sellPrice: sellPrice,
              currentPrice: position.curPrice,
              orderId: orderId,
              marketTitle: position.title || "Unknown",
              outcome: position.outcome || "Unknown",
            });
          } catch (dbError) {
            // Don't fail if DB write fails - it's just for audit
            console.warn(`[PositionSeller] Warning: Failed to record sale in DB (audit only)`);
          }

          soldCount++;

          // Small delay between orders to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`[PositionSeller] Error selling position ${position.outcome}:`, error);
          errorCount++;
        }
      }

      const duration = (Date.now() - startTime) / 1000;
      console.log(
        `[PositionSeller] Completed: ${soldCount} sold, ${skippedCount} skipped, ${errorCount} errors (${duration.toFixed(1)}s)`
      );
    } catch (error) {
      console.error("[PositionSeller] Error in checkAndSellPositions:", error);
    } finally {
      this.isSelling = false;
    }
  }

  /**
   * Get midpoint price for a token from the orderbook
   */
  private static async getMidpointPrice(tokenId: string): Promise<number> {
    try {
      const polymarketService = getPolymarketOrderService();
      const client = polymarketService.getClient();
      if (!client) return 0;

      const midpoint = await client.getMidpoint(tokenId);
      return parseFloat(midpoint?.mid || "0");
    } catch (error) {
      return 0;
    }
  }

  /**
   * Scan on-chain for CTF token balances using recent transfer events
   * This catches positions that might not be in the Positions API yet
   */
  private static async scanOnChainPositions(): Promise<
    Array<PolymarketPosition & { fromAPI: boolean }>
  > {
    if (!this.provider || !this.ownerAddress) return [];

    const positions: Array<PolymarketPosition & { fromAPI: boolean }> = [];

    try {
      const ctfContract = new ethers.Contract(
        CTF_ADDRESS,
        [
          ...ERC1155_ABI,
          "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
        ],
        this.provider
      );

      // Get recent transfer events to our address (last ~1000 blocks ≈ 30 mins on Polygon)
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = currentBlock - 1000;

      const filter = ctfContract.filters.TransferSingle(null, null, this.ownerAddress);
      const events = await ctfContract.queryFilter(filter, fromBlock, currentBlock);

      console.log(`[PositionSeller] Found ${events.length} recent transfer events to wallet`);

      // Get unique token IDs from events
      const tokenIds = new Set<string>();
      for (const event of events) {
        if ("args" in event && event.args) {
          const tokenId = event.args.id.toString();
          tokenIds.add(tokenId);
        }
      }

      // Check current balance for each token
      for (const tokenId of tokenIds) {
        const balance = await this.getOnChainBalance(tokenId);
        if (balance > 0n) {
          const balanceNum = Number(balance) / 1e6;
          positions.push({
            proxyWallet: "",
            asset: tokenId,
            conditionId: "",
            size: balanceNum,
            avgPrice: 0,
            currentValue: 0,
            cashPnl: 0,
            percentPnl: 0,
            curPrice: 0, // Will try to get from orderbook
            title: `Token ${tokenId.slice(0, 20)}...`,
            slug: "",
            icon: "",
            eventSlug: "",
            outcome: `Token ${tokenId.slice(0, 10)}...`,
            outcomeIndex: 0,
            oppositeOutcome: "",
            oppositeAsset: "",
            endDate: "",
            negativeRisk: false,
            fromAPI: false,
          });
        }
      }
    } catch (error: any) {
      console.warn(`[PositionSeller] Error scanning on-chain positions: ${error.message}`);
    }

    return positions;
  }

  /**
   * Merge positions from API and on-chain, using on-chain balance as source of truth
   */
  private static mergePositions(
    apiPositions: PolymarketPosition[],
    onChainPositions: Array<PolymarketPosition & { fromAPI: boolean }>
  ): Array<PolymarketPosition & { fromAPI: boolean }> {
    const positionMap = new Map<string, PolymarketPosition & { fromAPI: boolean }>();

    // Add API positions first (they have metadata like title, outcome, price)
    for (const pos of apiPositions) {
      positionMap.set(pos.asset, { ...pos, fromAPI: true });
    }

    // Merge/add on-chain positions
    for (const pos of onChainPositions) {
      const existing = positionMap.get(pos.asset);
      if (existing) {
        // Update size from on-chain if different
        if (pos.size !== existing.size) {
          console.log(
            `[PositionSeller] Balance mismatch for ${pos.asset.slice(0, 20)}: API=${existing.size}, on-chain=${pos.size}`
          );
          existing.size = pos.size; // Use on-chain balance
        }
      } else {
        // New position only found on-chain
        positionMap.set(pos.asset, pos);
      }
    }

    return Array.from(positionMap.values());
  }

  /**
   * Manually trigger a position check and sell
   */
  static async triggerSell(): Promise<void> {
    await this.initialize();
    await this.checkAndSellPositions();
  }

  /**
   * Get the current status of the sell routine
   */
  static getStatus(): {
    isRunning: boolean;
    isSelling: boolean;
    ownerAddress: string | null;
  } {
    return {
      isRunning: this.sellInterval !== null,
      isSelling: this.isSelling,
      ownerAddress: this.ownerAddress,
    };
  }
}
