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

export class PolymarketOrderService {
  private clobClient: ClobClient | null = null;
  private isInitialized = false;
  private nonce = 0;
  private provider: ethers.providers.Provider | null = null;
  private signer: ethers.Wallet | null = null;
  private USDC = process.env.USDC_ADDRESS || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
  private POLYMARKET_CONTRACT = process.env.POLYMARKET_CONTRACT_ADDRESS || '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

  /**
   * Initialize the Polymarket CLOB client
   */
  async initialize(): Promise<void> {
    try {
      const host = process.env.CLOB_API_URL || 'https://clob.polymarket.com';
      const chainId = parseInt(process.env.CHAIN_ID || '137');
      this.provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || "https://polygon-rpc.com");
      this.signer = new ethers.Wallet(process.env.PK as string, this.provider);

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
      
      // Initialize the client
      this.clobClient = new ClobClient(
        host, 
        chainId, 
        this.signer, 
        creds, 
        0, 
        this.signer.address
      );
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Polymarket CLOB client:', error);
      throw new Error('Failed to initialize Polymarket client');
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
   * @param requiredAmount - Required amount in wei
   * @param spender - Spender address (usually the Polymarket contract)
   * @returns Promise<boolean> - true if allowance is sufficient
   */
  private async checkAllowance(token: string, requiredAmount: number, spender: string): Promise<boolean> {
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
      const currentAllowance = await tokenContract.allowance(
        this.signer.address, // owner
        spender // spender (Polymarket contract)
      );
      
      // Convert required amount to BigNumber for comparison
      const requiredBN = ethers.BigNumber.from(requiredAmount);
      
      // Check if allowance is sufficient
      const isSufficient = currentAllowance.gte(requiredBN);
      console.log(`Allowance check for ${token}:`, {
        owner: this.signer.address,
        spender,
        currentAllowance: currentAllowance.toString(),
        requiredAmount,
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
      const erc20Abi = [
        "function decimals() view returns (uint8)"
      ];
      const tokenContract = new ethers.Contract(token, erc20Abi, this.provider);
      const decimals: number = await tokenContract.decimals();
      return decimals;
    } catch (error) {
      console.error('Failed to get token decimals:', error);
      throw new Error(`Failed to get token decimals: ${error}`);
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
    const decimals = await this.getTokenDecimals(this.USDC);
    let ok = await this.checkAllowance(this.USDC, (config.price * config.size) * (10 ** decimals), this.POLYMARKET_CONTRACT);
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
      }, { tickSize: "0.01" }, OrderType.GTC);

      return { response };
    } catch (error) {
      console.error('Failed to create GTC order:', error);
      throw new Error('Failed to create GTC order');
    }
  }

  /**
   * Create a Good Till Date (GTD) order
   */
  async postGTDOrder(config: PolymarketOrderConfig & { expiration: number }) {
    this.checkInitialization();
    const decimals = await this.getTokenDecimals(this.USDC);
    let ok = await this.checkAllowance(this.USDC, (config.price * config.size) * (10 ** decimals), this.POLYMARKET_CONTRACT);
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
    } catch (error) {
      console.error('Failed to create GTD order:', error);
      throw new Error('Failed to create GTD order');
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

// Export a singleton instance
export const polymarketOrderService = new PolymarketOrderService(); 