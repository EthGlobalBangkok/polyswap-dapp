import { type Market } from "../interfaces/Market";

// Raw shape returned by Polymarket Gamma API — only the fields we use.
// The API returns many more fields; we type only what we read.
interface GammaApiMarket {
  id: string;
  slug?: string;
  question?: string;
  // category lives on the parent event, not the market itself
  volume?: string | number;
  volumeNum?: number;
  liquidity?: string | number;
  liquidityNum?: number;
  liquidityClob?: number;
  endDate?: string;
  clobTokenIds?: string; // JSON-encoded string array
  active?: boolean;
  events?: Array<{
    category?: string;
  }>;
}

export interface GetOpenMarketsOptions {
  endDateMin?: string; // ISO date string, e.g. "2025-07-24T12:00:00Z"
  limit?: number; // Defaults to 1000 per page
  maxNb?: number; // Optional total cap
}

export class PolymarketAPIService {
  private static readonly BASE_URL =
    process.env.POLYMARKET_API_URL ?? "https://gamma-api.polymarket.com";

  /**
   * Fetch all active, non-closed markets from Polymarket Gamma with
   * pagination. Maps each result to the lean Market interface.
   */
  static async getOpenMarkets(options: GetOpenMarketsOptions = {}): Promise<Market[]> {
    const { endDateMin, maxNb, limit: pageLimit = 1000 } = options;
    const allMarkets: Market[] = [];
    let offset = 0;

    try {
      do {
        const url = new URL(`${this.BASE_URL}/markets`);
        url.searchParams.set("active", "true");
        url.searchParams.set("closed", "false");
        if (endDateMin) {
          url.searchParams.set("end_date_min", endDateMin);
        }
        url.searchParams.set("limit", pageLimit.toString());
        url.searchParams.set("offset", offset.toString());

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`Gamma API error: ${response.status}`);
        }

        // Gamma returns a plain array
        const raw: unknown = await response.json();
        if (!Array.isArray(raw)) {
          throw new Error(`Unexpected Gamma response: ${JSON.stringify(raw)}`);
        }
        // Safe cast: raw is the array we fetched from the known endpoint
        const page = raw as GammaApiMarket[];

        if (page.length === 0) break;

        for (const item of page) {
          const lean = this.toLeanMarket(item);
          if (lean) allMarkets.push(lean);
        }

        offset += page.length;

        if (maxNb && allMarkets.length >= maxNb) break;

        // Be polite to the API
        await new Promise((resolve) => setTimeout(resolve, 50));
      } while (true);
    } catch (error) {
      console.error("Error fetching markets from Gamma:", error);
      if (allMarkets.length === 0) throw error;
    }

    if (maxNb && allMarkets.length > maxNb) {
      return allMarkets.slice(0, maxNb);
    }
    return allMarkets;
  }

  /**
   * Map a raw Gamma API market to the lean Market interface.
   * Returns null when required fields (id, slug, question) are missing.
   */
  private static toLeanMarket(raw: GammaApiMarket): Market | null {
    if (!raw.id || !raw.slug || !raw.question) return null;

    // Category lives on the first parent event (if any)
    const category = raw.events?.[0]?.category ?? null;

    // Volume: prefer volumeNum (already numeric), else parse string
    const volume =
      raw.volumeNum !== undefined
        ? raw.volumeNum
        : typeof raw.volume === "number"
          ? raw.volume
          : parseFloat(raw.volume ?? "0") || 0;

    // Liquidity: prefer liquidityClob > liquidityNum > string
    const liquidity =
      raw.liquidityClob !== undefined
        ? raw.liquidityClob
        : raw.liquidityNum !== undefined
          ? raw.liquidityNum
          : typeof raw.liquidity === "number"
            ? raw.liquidity
            : parseFloat(raw.liquidity ?? "0") || 0;

    // clobTokenIds arrives as a JSON-encoded string from Gamma, e.g. '["123","456"]'
    let clobTokenIds: string[] = [];
    if (raw.clobTokenIds) {
      try {
        const parsed: unknown = JSON.parse(raw.clobTokenIds);
        clobTokenIds = Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        clobTokenIds = [];
      }
    }

    return {
      id: raw.id,
      slug: raw.slug,
      question: raw.question,
      category,
      volume,
      liquidity,
      endDate: raw.endDate ? new Date(raw.endDate) : null,
      clobTokenIds,
      active: raw.active ?? true,
    };
  }
}
