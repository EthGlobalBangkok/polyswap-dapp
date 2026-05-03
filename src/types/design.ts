export type MarketCategory =
  | "Politics"
  | "Elections"
  | "Geopolitics"
  | "Crypto"
  | "Sports"
  | "Soccer"
  | "Esports"
  | "Tech"
  | "AI"
  | "Culture"
  | "Finance"
  | "Economy"
  | "Weather";

export const MARKET_CATEGORIES: ReadonlyArray<MarketCategory> = [
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

// Categories whose outcomes can plausibly move crypto prices: macro/regulation,
// monetary, geopolitics, big-tech catalysts, and crypto itself. Used to filter
// the default "All" view and the visible category pills.
export const CRYPTO_RELEVANT_CATEGORIES: ReadonlyArray<MarketCategory> = [
  "Crypto",
  "Politics",
  "Elections",
  "Geopolitics",
  "Economy",
  "Finance",
  "Tech",
  "AI",
];

export type SwapStatus = "waiting" | "ready" | "done" | "cancelled";

export type Side = "YES" | "NO";

export interface MarketViewModel {
  id: string;
  category: MarketCategory;
  question: string;
  yesProbability: number;
  volume24h: number;
  endsAt: string;
  spark: number[];
}

export interface TokenViewModel {
  symbol: string;
  name: string;
  priceUsd: number;
  /** Polygon contract address for this token. */
  address: `0x${string}`;
  /** Token decimals (e.g. 6 for USDC, 18 for WETH). */
  decimals: number;
}

export interface SwapViewModel {
  id: string;
  nickname: string;
  status: SwapStatus;
  market: MarketViewModel;
  side: Side;
  threshold: number;
  from: { symbol: string; amount: number };
  to: { symbol: string };
  quote: number;
  createdAt?: string;
  filledAt?: string;
  cancelledAt?: string;
}
