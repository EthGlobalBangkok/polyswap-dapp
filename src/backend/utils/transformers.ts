import { type DatabaseMarket } from "../interfaces/Database";

/**
 * Transform a lean DatabaseMarket row into the JSON shape returned by
 * GET /api/markets/search. Consumers (useMarketsData) merge this with
 * live Polymarket Gamma data for prices, outcomes, and order-book depth.
 */
export function transformDatabaseMarket(dbMarket: DatabaseMarket) {
  return {
    id: dbMarket.id,
    slug: dbMarket.slug,
    question: dbMarket.question,
    category: dbMarket.category,
    volume: dbMarket.volume,
    liquidity: dbMarket.liquidity,
    end_date: dbMarket.end_date ? new Date(dbMarket.end_date).toISOString() : null,
    clob_token_ids: dbMarket.clob_token_ids ?? [],
    active: dbMarket.active,
  };
}

export function transformDatabaseMarkets(dbMarkets: DatabaseMarket[]) {
  return dbMarkets.map(transformDatabaseMarket);
}
