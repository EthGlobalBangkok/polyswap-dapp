export interface Market {
  id: string;
  slug: string;
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
