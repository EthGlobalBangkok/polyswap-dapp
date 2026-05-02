/**
 * Client-side direct fetches to Polymarket Gamma API.
 *
 * Live data (prices, outcomes, order-book depth) is fetched here rather than
 * stored in the DB. The DB holds only the lean search-index (id, slug, question,
 * category, volume, liquidity, end_date, clob_token_ids, active).
 */

const GAMMA_BASE = "https://gamma-api.polymarket.com";

/**
 * Raw shape returned by the Gamma /markets endpoint.
 * Only the fields we actually use are typed here. The API returns many more.
 */
export interface GammaMarket {
  id: string;
  slug: string;
  question: string;
  description?: string;
  /** JSON-encoded string array e.g. '["Yes","No"]' */
  outcomes: string;
  /** JSON-encoded string array of probabilities e.g. '["0.55","0.45"]' */
  outcomePrices: string;
  volume: string;
  liquidity: string;
  endDate: string;
  /** JSON-encoded string array of token IDs */
  clobTokenIds: string;
  active: boolean;
  closed: boolean;
  category?: string;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
}

/**
 * Decode the JSON-encoded string arrays that Gamma returns for outcomes/prices.
 * Returns an empty array if parsing fails.
 */
export function parseGammaArray(jsonStr: string): string[] {
  try {
    const parsed: unknown = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Fetch a single market by its slug from Polymarket Gamma.
 * Returns null if not found or on error.
 */
export async function fetchGammaMarketBySlug(slug: string): Promise<GammaMarket | null> {
  const url = `${GAMMA_BASE}/markets?slug=${encodeURIComponent(slug)}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gamma fetch failed: ${res.status}`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error("Gamma API returned non-array response");
  return (json as GammaMarket[])[0] ?? null;
}

/**
 * Fetch multiple markets by their Gamma numeric IDs.
 * Returns an empty array if ids is empty.
 */
export async function fetchGammaMarketsByIds(ids: string[]): Promise<GammaMarket[]> {
  if (ids.length === 0) return [];
  const params = ids.map((id) => `id=${encodeURIComponent(id)}`).join("&");
  const url = `${GAMMA_BASE}/markets?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gamma fetch failed: ${res.status}`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error("Gamma API returned non-array response");
  return json as GammaMarket[];
}
