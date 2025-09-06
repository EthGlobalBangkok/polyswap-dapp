import { ApiKeyCreds, ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { ethers } from "ethers";

export interface PolymarketOrderConfig {
  tokenID: string;
  price: number;
  side: 'BUY' | 'SELL';
  size: number;
  feeRateBps?: number;
  expiration?: number;
}

export interface PolymarketMarketOrderConfig {
  side: 'BUY' | 'SELL';
  tokenID: string;
  amount: number; // For BUY: amount in USD, for SELL: amount in shares
  feeRateBps?: number;
  price?: number; // Optional price limit for market orders
}

// Global variables for singleton pattern
let polymarketOrderServiceInstance: PolymarketOrderService | null = null;
let initializationPromise: Promise<void> | null = null;

export class PolymarketOrderService {
  private clobClient: ClobClient | null = null;
  private isInitialized = false;
  private nonce = 0;
  private provider: ethers.Provider | null = null;
  private signer: ethers.Wallet | null = null;
  private USDC = process.env.USDC_ADDRESS || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
  private POLYMARKET_CONTRACT = process.env.POLYMARKET_CONTRACT_ADDRESS || '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

  /**
   * Private constructor to prevent direct instantiation
   */
  private constructor() {}

  /**
   * Get the singleton instance of PolymarketOrderService
   */
  public static getInstance(): PolymarketOrderService {
    if (!polymarketOrderServiceInstance) {
      polymarketOrderServiceInstance = new PolymarketOrderService();
    }
    return polymarketOrderServiceInstance;
  }

  /**
   * Initialize the Polymarket CLOB client (singleton pattern)
   */
  public async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) {
      console.log('PolymarketOrderService already initialized, skipping...');
      return;
    }

    // If initialization is in progress, wait for it to complete
    if (initializationPromise) {
      console.log('PolymarketOrderService initialization in progress, waiting...');
      return initializationPromise;
    }

    // Start initialization
    initializationPromise = this.performInitialization();
    try {
      await initializationPromise;
      this.isInitialized = true;
      console.log('PolymarketOrderService successfully initialized');
    } catch (error) {
      // Reset initialization promise on failure so we can retry
      initializationPromise = null;
      throw error;
    }
  }

  /**
   * Perform the actual initialization
   */
  private async performInitialization(): Promise<void> {
    try {
      const host = process.env.CLOB_API_URL || 'https://clob.polymarket.com';
      const chainId = parseInt(process.env.CHAIN_ID || '137');
      
      console.log('Initializing provider with RPC URL:', process.env.RPC_URL || "https://polygon-rpc.com");
      
      // Use regular JsonRpcProvider
      const rpcUrl = process.env.RPC_URL || "https://polygon-rpc.com";
      
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Create ethers v6 signer
      const v6Signer = new ethers.Wallet(process.env.PK as string, this.provider);
      
      // Add the ethers v5 method name for compatibility
      (v6Signer as any)._signTypedData = v6Signer.signTypedData.bind(v6Signer);

      this.nonce = parseInt(process.env.NONCE || '0');
  
      // Create or derive API key
      const creds: ApiKeyCreds = {
        key: process.env.CLOB_API_KEY || '',
        secret: process.env.CLOB_SECRET || '',
        passphrase: process.env.CLOB_PASS_PHRASE || '',
      };
      if (!creds.key || !creds.secret || !creds.passphrase) {
        throw new Error('CLOB API credentials are not fully set in environment variables');
      }
      
      // Initialize the client with the v6 signer that has the compatibility method
      this.clobClient = new ClobClient(
        host, 
        chainId, 
        v6Signer as any, 
        creds, 
        0, 
        await v6Signer.getAddress()
      );
      
      this.signer = v6Signer;
      
      // Test the connection and log block number
      try {
        const blockNumber = await this.provider.getBlockNumber();
        console.log('Current block number:', blockNumber);
      } catch (networkError) {
        console.error('Failed to connect to Polygon network:', networkError);
        throw new Error(`Failed to connect to Polygon network: ${networkError}`);
      }
    } catch (error) {
      console.error('Failed to initialize Polymarket CLOB client:', error);
      throw new Error(`Failed to initialize Polymarket client: ${error}`);
    }
  }

  /**
   * Check if the service is initialized
   */
  private checkInitialization(): void {
    if (!this.isInitialized || !this.clobClient) {
      throw new Error('PolymarketOrderService not initialized. Call initialize() first.');
    }
  }

  /**
   * Check if the token allowance is sufficient for the required amount
   * @param token - Token contract address
   * @param requiredAmount - Required amount in wei (as BigInt)
   * @param spender - Spender address (usually the Polymarket contract)
   * @returns Promise<boolean> - true if allowance is sufficient
   */
  private async checkAllowance(token: string, requiredAmount: bigint, spender: string): Promise<boolean> {
    this.checkInitialization();
    
    if (!this.provider || !this.signer) {
      throw new Error('Provider or signer not initialized');
    }
    
    try {
      // ERC20 ABI for allowance function
      const erc20Abi = [
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address account) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ];
      
      // Create contract instance
      const tokenContract = new ethers.Contract(token, erc20Abi, this.provider);
      
      // Get current allowance
      const ownerAddress = await this.signer.getAddress();
      const currentAllowance = await tokenContract.allowance(
        ownerAddress, // owner
        spender // spender (Polymarket contract)
      );
      
      // Check if allowance is sufficient (both are BigInt in ethers v6)
      const isSufficient = currentAllowance >= requiredAmount;
      console.log(`Allowance check for ${token}:`, {
        owner: ownerAddress,
        spender,
        currentAllowance: currentAllowance.toString(),
        requiredAmount: requiredAmount.toString(),
        isSufficient
      });
      return isSufficient;
    } catch (error) {
      console.error('Failed to check allowance:', error);
      throw new Error(`Failed to check token allowance: ${error}`);
    }
  }

  private async getTokenDecimals(token: string): Promise<number> {
    this.checkInitialization();
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    
    try {
      console.log(`Getting decimals for token: ${token}`);
      
      // Validate token address format
      if (!ethers.isAddress(token)) {
        throw new Error(`Invalid token address format: ${token}`);
      }
      
      // ERC20 ABI for decimals function
      const erc20Abi = [
        "function decimals() view returns (uint8)"
      ];
      
      // Create contract instance
      const tokenContract = new ethers.Contract(token, erc20Abi, this.provider);
      
      // Call decimals function
      const decimalsResult = await tokenContract.decimals();
      // In ethers v6, contract call results might be BigInt, convert to number
      const decimals: number = Number(decimalsResult);
      console.log(`Token ${token} has ${decimals} decimals`);
      
      return decimals;
    } catch (error) {
      console.error('Failed to get token decimals:', error);
      
      // Log additional details about the error
      if (error.transaction) {
        console.error('Transaction details:', error.transaction);
      }
      if (error.error) {
        console.error('Error details:', error.error);
      }
      
      throw new Error(`Failed to get token decimals for token ${token}: ${error}`);
    }
  }

  async cancelAllOrders() {
    this.checkInitialization();
    try {
      const result = await this.clobClient!.cancelAll();
      return result;
    } catch (error) {
      console.error('Failed to cancel all orders:', error);
      throw new Error('Failed to cancel all orders');
    }
  }

  async getOrder(id: string) {
    this.checkInitialization();
    try {
      const orders = await this.clobClient!.getOrder(id);
      return orders;
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      throw new Error('Failed to fetch orders');
    }
  }

  /**
   * Create a Good Till Cancelled (GTC) order
   */
  async postGTCOrder(config: PolymarketOrderConfig) {
    this.checkInitialization();
    
    try {
      const decimals = await this.getTokenDecimals(this.USDC);
      // Convert all values to BigInt for arithmetic operations in ethers v6
      const priceBigInt = BigInt(Math.floor(config.price * 1000000));
      const sizeBigInt = BigInt(Math.floor(config.size * 1000000));
      const decimalsMultiplier = BigInt(10) ** BigInt(decimals);
      // Calculate required amount: (price * size) * (10 ** decimals)
      // We need to be careful with the precision here
      const requiredAmount = (priceBigInt * sizeBigInt * decimalsMultiplier) / (1000000n * 1000000n);
      
      let ok = await this.checkAllowance(this.USDC, requiredAmount, this.POLYMARKET_CONTRACT);
      if (!ok) {
        throw new Error('Insufficient allowance for USDC');
      }
      console.log("\nConfig: ", config, "\n");
      try {
        const response = await this.clobClient!.createAndPostOrder({
          tokenID: config.tokenID,
          price: config.price,
          side: config.side === 'BUY' ? Side.BUY : Side.SELL,
          size: config.size,
          feeRateBps: config.feeRateBps || 0,
        }, { tickSize: "0.01" }, OrderType.GTC);

        return { response };
      } catch (error: any) {
        console.error('Failed to create GTC order:', error);
        // Provide more detailed error information
        const errorMessage = error.message || error.toString();
        const errorDetails = error.response?.data || error.response || error.stack || 'No additional details';
        throw new Error(`Failed to create GTC order: ${errorMessage}. Details: ${JSON.stringify(errorDetails)}`);
      }
    } catch (error) {
      console.error('Error in postGTCOrder:', error);
      throw error;
    }
  }

  /**
   * Create a Good Till Date (GTD) order
   */
  async postGTDOrder(config: PolymarketOrderConfig & { expiration: number }) {
    this.checkInitialization();
    
    try {
      const decimals = await this.getTokenDecimals(this.USDC);
      // Convert all values to BigInt for arithmetic operations in ethers v6
      const priceBigInt = BigInt(Math.floor(config.price * 1000000));
      const sizeBigInt = BigInt(Math.floor(config.size * 1000000));
      const decimalsMultiplier = BigInt(10) ** BigInt(decimals);
      // Calculate required amount: (price * size) * (10 ** decimals)
      const requiredAmount = (priceBigInt * sizeBigInt * decimalsMultiplier) / (1000000n * 1000000n);
      
      let ok = await this.checkAllowance(this.USDC, requiredAmount, this.POLYMARKET_CONTRACT);
      if (!ok) {
        throw new Error('Insufficient allowance for USDC');
      }
      
      try {
        const response = await this.clobClient!.createAndPostOrder({
          tokenID: config.tokenID,
          price: config.price,
          side: config.side === 'BUY' ? Side.BUY : Side.SELL,
          size: config.size,
          feeRateBps: config.feeRateBps || 0,
          expiration: config.expiration
        }, { tickSize: "0.01" }, OrderType.GTD);

        return { response };
      } catch (error: any) {
        console.error('Failed to create GTD order:', error);
        // Provide more detailed error information
        const errorMessage = error.message || error.toString();
        const errorDetails = error.response?.data || error.response || error.stack || 'No additional details';
        throw new Error(`Failed to create GTD order: ${errorMessage}. Details: ${JSON.stringify(errorDetails)}`);
      }
    } catch (error) {
      console.error('Error in postGTDOrder:', error);
      throw error;
    }
  }

  /**
   * Get the current client instance
   */
  getClient(): ClobClient | null {
    return this.clobClient;
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.clobClient !== null;
  }
}

// Export a singleton instance getter
export const getPolymarketOrderService = (): PolymarketOrderService => {
  return PolymarketOrderService.getInstance();
}; 