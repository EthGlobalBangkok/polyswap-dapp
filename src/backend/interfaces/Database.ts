export interface DatabaseMarket {
  id: string;
  question: string;
  condition_id: string;
  start_date: Date;
  end_date: Date;
  volume: number;
  outcomes: string[]; // JSON array
  outcome_prices: string[]; // JSON array
  created_at?: Date;
  updated_at?: Date;
}