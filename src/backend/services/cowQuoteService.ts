import { ethers } from 'ethers';

export interface CowQuoteRequest {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  userAddress: string;
  chainId: number;
}

export interface CowQuoteResponse {
  quote: {
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    buyAmount: string;
    feeAmount: string;
    validTo: number;
    kind: string;
    partiallyFillable: boolean;
    sellTokenBalance: string;
    buyTokenBalance: string;
    signingScheme: string;
    receiver: string;
    appData: string;
  };
  from: string;
  expiration: string;
  id: number;
  verified: boolean;
}

export interface QuoteResult {
  buyAmount: string;
  sellAmount: string;
  feeAmount: string;
  validTo: number;
  buyAmountFormatted: string;
  sellAmountFormatted: string;
  exchangeRate: string;
}

export class CowQuoteService {
  // Network-specific CoW Protocol API URLs
  private static readonly NETWORK_URLS: Record<number, string> = {
    1: 'https://api.cow.fi/mainnet',      // Ethereum Mainnet
    100: 'https://api.cow.fi/xdai',       // Gnosis Chain
    42161: 'https://api.cow.fi/arbitrum', // Arbitrum One
    8453: 'https://api.cow.fi/base',      // Base
    137: 'https://api.cow.fi/polygon',    // Polygon
  };

  // WETH addresses per network
  private static readonly WETH_ADDRESSES: Record<number, string> = {
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',      // Ethereum Mainnet
    100: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1',    // Gnosis Chain (WXDAI)
    42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',  // Arbitrum One
    8453: '0x4200000000000000000000000000000000000006',  // Base
    137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',   // Polygon (WMATIC)
  };

  /**
   * Get the CoW Protocol API URL for a specific chain
   */
  private static getApiUrl(chainId: number): string {
    const url = this.NETWORK_URLS[chainId];
    if (!url) {
      throw new Error(`Unsupported chain ID: ${chainId}. Supported chains: ${Object.keys(this.NETWORK_URLS).join(', ')}`);
    }
    return url;
  }

  /**
   * Convert ETH symbol to WETH address for the specific chain
   */
  private static convertEthToWeth(tokenAddress: string, chainId: number): string {
    const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    if (tokenAddress.toLowerCase() === ethAddress.toLowerCase()) {
      const wethAddress = this.WETH_ADDRESSES[chainId];
      if (!wethAddress) {
        throw new Error(`WETH address not found for chain ID: ${chainId}`);
      }
      return wethAddress;
    }
    return tokenAddress;
  }

  /**
   * Get a quote from CoW Protocol API
   * @param request Quote request parameters
   * @returns Quote result with buy/sell amounts and exchange rate
   */
  static async getCowSwapQuote(request: CowQuoteRequest): Promise<QuoteResult> {
    try {
      const { sellToken, buyToken, sellAmount, userAddress, chainId } = request;

      // Get the API URL for this chain
      const baseUrl = this.getApiUrl(chainId);

      // Convert ETH to WETH if needed
      const sellTokenAddress = this.convertEthToWeth(sellToken, chainId);
      const buyTokenAddress = this.convertEthToWeth(buyToken, chainId);

      // Validate addresses
      if (!ethers.isAddress(sellTokenAddress)) {
        throw new Error(`Invalid sell token address: ${sellTokenAddress}`);
      }
      if (!ethers.isAddress(buyTokenAddress)) {
        throw new Error(`Invalid buy token address: ${buyTokenAddress}`);
      }
      if (!ethers.isAddress(userAddress)) {
        throw new Error(`Invalid user address: ${userAddress}`);
      }

      // Validate sell amount
      const sellAmountValidation = BigInt(sellAmount);
      if (sellAmountValidation <= 0n) {
        throw new Error('Sell amount must be greater than 0');
      }

      // Build request body
      const requestBody = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        from: userAddress,
        receiver: userAddress,
        kind: 'sell',
        sellAmountBeforeFee: sellAmount,
      };

      console.log('Fetching quote from CoW Protocol:', {
        url: `${baseUrl}/api/v1/quote`,
        requestBody,
      });

      // Make API request
      const response = await fetch(`${baseUrl}/api/v1/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`CoW API error (${response.status}): ${errorText}`);
      }

      const quoteData: CowQuoteResponse = await response.json();

      // Validate response data - the quote data is nested in the 'quote' object
      if (!quoteData.quote || !quoteData.quote.buyAmount || !quoteData.quote.sellAmount) {
        console.error('Invalid quote response:', quoteData);
        throw new Error(`Invalid quote response: missing quote data`);
      }

      const quote = quoteData.quote;

      // Parse amounts
      const buyAmountBigInt = BigInt(quote.buyAmount);
      const sellAmountBigInt = BigInt(quote.sellAmount);

      // Note: We return the raw exchange rate here without formatting
      // The frontend will handle the decimal conversion based on token decimals
      // This is just buyAmount / sellAmount in wei
      const PRECISION = 1000000000000n; // Use high precision for accurate rate
      const rate = (buyAmountBigInt * PRECISION) / sellAmountBigInt;
      const rateFormatted = (Number(rate) / Number(PRECISION)).toString();

      return {
        buyAmount: quote.buyAmount,
        sellAmount: quote.sellAmount,
        feeAmount: quote.feeAmount || '0',
        validTo: quote.validTo || 0,
        buyAmountFormatted: buyAmountBigInt.toString(),
        sellAmountFormatted: sellAmountBigInt.toString(),
        exchangeRate: rateFormatted,
      };
    } catch (error) {
      console.error('Error fetching CoW quote:', error);
      throw new Error(`Failed to fetch quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Format token amount from wei to human-readable format
   * @param amountWei Amount in wei (as string)
   * @param decimals Token decimals
   * @returns Formatted amount as string
   */
  static formatTokenAmount(amountWei: string, decimals: number): string {
    try {
      const formatted = ethers.formatUnits(amountWei, decimals);
      return formatted;
    } catch (error) {
      console.error('Error formatting token amount:', error);
      return '0';
    }
  }

  /**
   * Parse token amount from human-readable to wei
   * @param amount Human-readable amount
   * @param decimals Token decimals
   * @returns Amount in wei as string
   */
  static parseTokenAmount(amount: string, decimals: number): string {
    try {
      const parsed = ethers.parseUnits(amount, decimals);
      return parsed.toString();
    } catch (error) {
      console.error('Error parsing token amount:', error);
      return '0';
    }
  }
}

export default CowQuoteService;
