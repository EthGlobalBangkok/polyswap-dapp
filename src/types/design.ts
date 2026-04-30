export type MarketCategory = "Macro" | "Politics" | "Crypto" | "Geopolitics";

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
