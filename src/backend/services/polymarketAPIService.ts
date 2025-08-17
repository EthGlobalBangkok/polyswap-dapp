import { Market } from '../interfaces/Market';

export interface GetOpenMarketsOptions {
  endDateMin: string; // ISO date string like "2025-07-24T12:00:00Z"
  maxNb?: number; // Optional maximum number of markets to fetch
}

export class PolymarketAPIService {
  private static readonly BASE_URL = process.env.POLYMARKET_API_URL || 'https://gamma-api.polymarket.com';

  /**
   * Fetch all active markets from Polymarket API with pagination support
   * @param options Configuration object with endDateMin and optional maxNb
   * @returns Promise<Market[]> Array of all fetched markets
   */
  static async getOpenMarkets(options: GetOpenMarketsOptions): Promise<Market[]> {
    const { endDateMin, maxNb } = options;
    const baseUrl = `${this.BASE_URL}/markets`;
    const allMarkets: Market[] = [];
    let nextCursor = 0;
    let fetchedCount = 0;

    try {
      do {
        // Build URL with query parameters
        const url = new URL(baseUrl);
        url.searchParams.set("active", "true");
        url.searchParams.set("closed", "false");
        url.searchParams.set("end_date_min", endDateMin);
        
        if (nextCursor) {
          url.searchParams.set("offset", nextCursor.toString());
        }
        
        const response = await fetch(url.toString());
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`Received response with ${Array.isArray(data) ? data.length : 'unknown'} items`);
        
        // Check if data is an array or has a data property
        let markets: Market[];
        if (Array.isArray(data)) {
          markets = data;
          nextCursor += markets.length;
        } else {
          throw new Error(`Unexpected response structure: ${JSON.stringify(data)}`);
        }
        
        // Add fetched markets to our collection
        allMarkets.push(...markets);
        fetchedCount += markets.length;
        
        console.log(`Fetched ${markets.length} markets. Total: ${fetchedCount}`);
        
        // Check if we've reached the maximum number of markets (if specified)
        if (maxNb && fetchedCount >= maxNb) {
          console.log(`Reached maximum limit of ${maxNb} markets`);
          break;
        }
        if (markets.length === 0) {
          console.log("No more markets to fetch, exiting loop");
          break;
        }
        
        // Add a small delay to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } while (true);

      console.log(`Finished fetching. Total markets retrieved: ${allMarkets.length}`);
      
      // If maxNb was specified and we have more markets than requested, trim the array
      if (maxNb && allMarkets.length > maxNb) {
        return allMarkets.slice(0, maxNb);
      }
      
      return allMarkets;
      
    } catch (error) {
      console.error("Error fetching markets:", error);
      if (allMarkets.length === 0) {
        throw error;
      }
      console.log(`Returning ${allMarkets.length} markets that were successfully fetched before the error`);
      
      // If maxNb was specified and we have more markets than requested, trim the array
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
      console.log(`Received response with ${Array.isArray(data) ? data.length : 'unknown'} items`);
      
      // Check if data is an array
      if (!Array.isArray(data)) {
        throw new Error(`Unexpected response structure: ${JSON.stringify(data)}`);
      }
      
      // Return the first market found or null
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