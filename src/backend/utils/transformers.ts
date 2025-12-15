import { DatabaseMarket } from '../interfaces/Database';

// Transform database market to API format expected by frontend
export function transformDatabaseMarket(dbMarket: DatabaseMarket) {
  return {
    id: dbMarket.id,
    question: dbMarket.question,
    volume: dbMarket.volume.toString(),
    end_date: dbMarket.end_date.toISOString(),
    outcomes: Array.isArray(dbMarket.outcomes) ? dbMarket.outcomes : JSON.parse(dbMarket.outcomes as string),
    outcome_prices: Array.isArray(dbMarket.outcome_prices)
      ? dbMarket.outcome_prices.map(price => typeof price === 'string' ? parseFloat(price) : price)
      : JSON.parse(dbMarket.outcome_prices as string).map((price: string) => parseFloat(price)),
    category: dbMarket.category,
    condition_id: dbMarket.condition_id,
    slug: dbMarket.slug,
    event_slug: dbMarket.event_slug || null,
    clob_token_ids: Array.isArray(dbMarket.clob_token_ids)
      ? dbMarket.clob_token_ids
      : (dbMarket.clob_token_ids ? JSON.parse(dbMarket.clob_token_ids as string) : []),
    description: '' // Database doesn't store description, could be added later
  };
}

// Transform array of database markets
export function transformDatabaseMarkets(dbMarkets: DatabaseMarket[]) {
  return dbMarkets.map(transformDatabaseMarket);
}
