export interface DatabaseMarket {
  id: string;
  question: string;
  condition_id: string;
  slug: string; // Market slug for URL-friendly identifiers
  category: string;
  start_date: Date;
  end_date: Date;
  volume: number;
  outcomes: string[]; // JSON array
  outcome_prices: string[]; // JSON array
  clob_token_ids: string[]; // JSON array of CLOB token IDs
  created_at?: Date;
  updated_at?: Date;
}