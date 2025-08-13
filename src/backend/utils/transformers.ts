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
    description: '' // Database doesn't store description, could be added later
  };
}

// Transform array of database markets
export function transformDatabaseMarkets(dbMarkets: DatabaseMarket[]) {
  return dbMarkets.map(transformDatabaseMarket);
}
