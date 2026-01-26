import { Market } from "../interfaces/Market";

export interface GetOpenMarketsOptions {
  endDateMin: string; // ISO date string like "2025-07-24T12:00:00Z"
  maxNb?: number; // Optional maximum number of markets to fetch
}

export class PolymarketAPIService {
  private static readonly BASE_URL =
    process.env.POLYMARKET_API_URL || "https://gamma-api.polymarket.com";

  /**
   * Fetch all active markets from Polymarket API with pagination support
   * @param options Configuration object with endDateMin and optional maxNb
   * @returns Promise<Market[]> Array of all fetched markets
   */
  static async getOpenMarkets(options: GetOpenMarketsOptions): Promise<Market[]> {
    const { endDateMin, maxNb } = options;
    const baseUrl = `${this.BASE_URL}/markets`;
    const allMarkets: Market[] = [];
    const limit = 1000;
    let nextCursor = 0;
    let fetchedCount = 0;

    try {
      do {
        // Build URL with query parameters
        const url = new URL(baseUrl);
        url.searchParams.set("active", "true");
        url.searchParams.set("closed", "false");
        url.searchParams.set("end_date_min", endDateMin);
        url.searchParams.set("limit", limit.toString());

        if (nextCursor) {
          url.searchParams.set("offset", nextCursor.toString());
        }

        const response = await fetch(url.toString());

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        let markets: Market[];
        if (Array.isArray(data)) {
          markets = data;
          nextCursor += markets.length;
        } else {
          throw new Error(`Unexpected response structure: ${JSON.stringify(data)}`);
        }

        allMarkets.push(...markets);
        fetchedCount += markets.length;

        if (maxNb && fetchedCount >= maxNb) {
          break;
        }
        if (markets.length === 0) {
          break;
        }

        // Add a small delay to be respectful to the API
        await new Promise((resolve) => setTimeout(resolve, 50));
      } while (true);

      if (maxNb && allMarkets.length > maxNb) {
        return allMarkets.slice(0, maxNb);
      }

      return allMarkets;
    } catch (error) {
      console.error("Error fetching markets:", error);
      if (allMarkets.length === 0) {
        throw error;
      }

      if (maxNb && allMarkets.length > maxNb) {
        return allMarkets.slice(0, maxNb);
      }

      return allMarkets;
    }
  }

  /**
   * Fetch a market by its condition ID
   * @param conditionId The condition ID to search for
   * @returns Promise<Market | null> The market or null if not found
   */
  static async getMarketByConditionId(conditionId: string): Promise<Market | null> {
    const baseUrl = `${this.BASE_URL}/markets`;

    try {
      // Build URL with query parameters
      const url = new URL(baseUrl);
      url.searchParams.set("condition_id", conditionId);

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error(`Unexpected response structure: ${JSON.stringify(data)}`);
      }

      return data[0] || null;
    } catch (error) {
      console.error("Error fetching market by condition ID:", error);
      throw error;
    }
  }

  /**
   * Fetch a market by its ID
   * @param id The market ID to search for
   * @returns Promise<Market | null> The market or null if not found
   */
  static async getMarketById(id: string): Promise<Market | null> {
    const baseUrl = `${this.BASE_URL}/markets`;

    try {
      // Build URL with query parameters
      const url = new URL(baseUrl);
      url.searchParams.set("id", id);

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Check if data is an array
      if (!Array.isArray(data)) {
        throw new Error(`Unexpected response structure: ${JSON.stringify(data)}`);
      }

      // Return the first market found or null
      return data[0] || null;
    } catch (error) {
      console.error("Error fetching market by ID:", error);
      throw error;
    }
  }
}
