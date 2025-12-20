/**
 * Service for fetching token USD prices from CoW Protocol BFF API
 */
export class TokenPriceService {
  // CoW Protocol BFF API base URL
  private static readonly BFF_BASE_URL = "https://bff.cow.fi";

  // Cache for token prices (simple in-memory cache)
  private static priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private static readonly CACHE_DURATION_MS = 60000; // 1 minute cache

  /**
   * Get USD price for a token
   * @param tokenAddress The token contract address
   * @param chainId The chain ID (1 = Ethereum, 137 = Polygon, etc.)
   * @returns The USD price of the token, or null if unavailable
   */
  static async getTokenUsdPrice(tokenAddress: string, chainId: number): Promise<number | null> {
    try {
      // Check cache first
      const cacheKey = `${chainId}:${tokenAddress.toLowerCase()}`;
      const cached = this.priceCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
        return cached.price;
      }

      // Fetch from BFF API
      const url = `${this.BFF_BASE_URL}/${chainId}/tokens/${tokenAddress}/usdPrice`;

      const response = await fetch(url);

      if (!response.ok) {
        console.warn(
          `Failed to fetch price for ${tokenAddress} on chain ${chainId}: ${response.status}`
        );
        return null;
      }

      const data = await response.json();

      if (typeof data.price !== "number") {
        console.warn(`Invalid price response for ${tokenAddress}:`, data);
        return null;
      }

      // Update cache
      this.priceCache.set(cacheKey, {
        price: data.price,
        timestamp: Date.now(),
      });

      return data.price;
    } catch (error) {
      console.error(`Error fetching USD price for ${tokenAddress}:`, error);
      return null;
    }
  }

  /**
   * Get USD prices for multiple tokens
   * @param tokens Array of {address, chainId} objects
   * @returns Map of tokenAddress -> USD price
   */
  static async getMultipleTokenPrices(
    tokens: Array<{ address: string; chainId: number }>
  ): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();

    // Fetch all prices in parallel
    const promises = tokens.map(async ({ address, chainId }) => {
      const price = await this.getTokenUsdPrice(address, chainId);
      if (price !== null) {
        priceMap.set(address.toLowerCase(), price);
      }
    });

    await Promise.all(promises);

    return priceMap;
  }

  /**
   * Clear the price cache (useful for testing or forcing fresh data)
   */
  static clearCache(): void {
    this.priceCache.clear();
  }
}

export default TokenPriceService;
