import { type Market } from "../interfaces/Market";
import { createLogger } from "../logger";

const log = createLogger("polymarket-api");

interface GammaApiMarket {
  id: string;
  slug?: string;
  question?: string;
  description?: string;
  outcomes?: string;
  volume?: string | number;
  volumeNum?: number;
  liquidity?: string | number;
  liquidityNum?: number;
  liquidityClob?: number;
  endDate?: string;
  clobTokenIds?: string;
  active?: boolean;
}

interface GammaApiTag {
  label?: string;
}

interface GammaApiEvent {
  slug?: string;
  tags?: GammaApiTag[];
  markets?: GammaApiMarket[];
}

export interface GetOpenMarketsOptions {
  endDateMin?: string;
  limit?: number;
  maxNb?: number;
}

const CANONICAL_CATEGORIES: readonly string[] = [
  "Politics",
  "Elections",
  "Geopolitics",
  "Crypto",
  "Sports",
  "Soccer",
  "Esports",
  "Tech",
  "AI",
  "Culture",
  "Finance",
  "Economy",
  "Weather",
];

function derivePrimaryCategory(tags: readonly string[]): string | null {
  if (tags.length === 0) return null;
  const tagSet = new Set(tags);
  for (const canonical of CANONICAL_CATEGORIES) {
    if (tagSet.has(canonical)) return canonical;
  }
  return null;
}

export class PolymarketAPIService {
  private static readonly BASE_URL =
    process.env.POLYMARKET_API_URL ?? "https://gamma-api.polymarket.com";

  // Uses /events because /markets does not return tag labels.
  static async getOpenMarkets(options: GetOpenMarketsOptions = {}): Promise<Market[]> {
    const { endDateMin, maxNb, limit: pageLimit = 500 } = options;
    const allMarkets: Market[] = [];
    let offset = 0;

    try {
      do {
        const url = new URL(`${this.BASE_URL}/events`);
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

        const raw: unknown = await response.json();
        if (!Array.isArray(raw)) {
          throw new Error(`Unexpected Gamma response: ${JSON.stringify(raw)}`);
        }
        const page = raw as GammaApiEvent[];

        if (page.length === 0) break;

        for (const event of page) {
          const tags = (event.tags ?? [])
            .map((t) => t.label)
            .filter((l): l is string => typeof l === "string" && l.length > 0);
          const category = derivePrimaryCategory(tags);
          const eventSlug = event.slug ?? null;
          for (const market of event.markets ?? []) {
            const lean = this.toLeanMarket(market, tags, category, eventSlug);
            if (lean) allMarkets.push(lean);
          }
        }

        offset += page.length;

        if (maxNb && allMarkets.length >= maxNb) break;

        await new Promise((resolve) => setTimeout(resolve, 50));
      } while (true);
    } catch (error) {
      log.error("failed to fetch markets from Gamma:", error);
      if (allMarkets.length === 0) throw error;
    }

    if (maxNb && allMarkets.length > maxNb) {
      return allMarkets.slice(0, maxNb);
    }
    return allMarkets;
  }

  private static toLeanMarket(
    raw: GammaApiMarket,
    tags: string[],
    category: string | null,
    eventSlug: string | null
  ): Market | null {
    if (!raw.id || !raw.slug || !raw.question) return null;

    const volume =
      raw.volumeNum !== undefined
        ? raw.volumeNum
        : typeof raw.volume === "number"
          ? raw.volume
          : parseFloat(raw.volume ?? "0") || 0;

    const liquidity =
      raw.liquidityClob !== undefined
        ? raw.liquidityClob
        : raw.liquidityNum !== undefined
          ? raw.liquidityNum
          : typeof raw.liquidity === "number"
            ? raw.liquidity
            : parseFloat(raw.liquidity ?? "0") || 0;

    let clobTokenIds: string[] = [];
    if (raw.clobTokenIds) {
      try {
        const parsed: unknown = JSON.parse(raw.clobTokenIds);
        clobTokenIds = Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        clobTokenIds = [];
      }
    }

    let outcomes: string[] = [];
    if (raw.outcomes) {
      try {
        const parsed: unknown = JSON.parse(raw.outcomes);
        outcomes = Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        outcomes = [];
      }
    }

    return {
      id: raw.id,
      slug: raw.slug,
      eventSlug,
      question: raw.question,
      description: raw.description ?? null,
      category,
      tags,
      outcomes,
      volume,
      liquidity,
      endDate: raw.endDate ? new Date(raw.endDate) : null,
      clobTokenIds,
      active: raw.active ?? true,
    };
  }
}
