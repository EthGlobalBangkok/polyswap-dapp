/**
 * Lean market shape stored in the DB search-index.
 * Live data (prices, outcomes, order-book depth) is NOT stored here —
 * it is fetched client-side from Polymarket Gamma.
 */
export interface Market {
  id: string;
  slug: string;
  question: string;
  category: string | null;
  volume: number;
  liquidity: number;
  endDate: Date | null;
  clobTokenIds: string[];
  active: boolean;
}
