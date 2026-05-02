/**
 * Lean market row as returned from Postgres.
 * Mirrors the lean `markets` table schema — no dynamic fields.
 */
export interface DatabaseMarket {
  id: string;
  slug: string;
  question: string;
  category: string | null;
  volume: number;
  liquidity: number;
  end_date: Date | null;
  clob_token_ids: string[]; // Postgres TEXT[] array
  active: boolean;
  updated_at?: Date;
}
