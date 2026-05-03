export interface DatabaseMarket {
  id: string;
  slug: string;
  question: string;
  description: string | null;
  category: string | null;
  tags: string[];
  outcomes: string[];
  volume: number;
  liquidity: number;
  end_date: Date | null;
  clob_token_ids: string[];
  active: boolean;
  updated_at?: Date;
}
