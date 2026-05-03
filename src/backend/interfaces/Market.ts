export interface Market {
  id: string;
  slug: string;
  /** Parent event slug — distinct from `slug` for events with multiple markets. */
  eventSlug: string | null;
  question: string;
  description: string | null;
  category: string | null;
  tags: string[];
  outcomes: string[];
  volume: number;
  liquidity: number;
  endDate: Date | null;
  clobTokenIds: string[];
  active: boolean;
}
