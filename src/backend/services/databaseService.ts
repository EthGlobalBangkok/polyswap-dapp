import { query } from "../db/database";
import { type Market } from "../interfaces/Market";
import { type DatabaseMarket } from "../interfaces/Database";
import {
  type PolyswapOrderData,
  type PolyswapOrderRecord,
  type DatabasePolyswapOrder,
  type SoldPosition,
  type SoldPositionInput,
} from "../interfaces/PolyswapOrder";

// ============================================================
// Search options for the unified markets search endpoint
// ============================================================
export interface SearchMarketsOptions {
  q?: string;
  category?: string;
  categories?: string[];
  volumeMin?: number;
  liquidityMin?: number;
  sort?: "volume" | "liquidity" | "end_date" | "interest";
  limit?: number;
  offset?: number;
}

const INTEREST_MIN_VOLUME = 10_000;

const INTEREST_CATEGORY_BOOSTS: Record<string, number> = {
  Economy: 1.1,
  Crypto: 1.05,
};

const INTEREST_NOISE_REGEX = [
  "how many tweets",
  "number of tweets",
  "tweet count",
  "tweets in \\d{4}",
  "tweets between",
  "tweets per",
  "posts? \\d+(-\\d+)? tweets",
  "posts? \\d+\\+? tweets",
].join("|");

function buildPrefixTsQuery(input: string): string | null {
  const terms = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return null;
  return terms.map((t) => `${t}:*`).join(" & ");
}

export class DatabaseService {
  static async upsertMarket(market: Market): Promise<void> {
    await query(
      `INSERT INTO markets (
         id, slug, event_slug, question, description, category, tags, outcomes,
         volume, liquidity, end_date, clob_token_ids, active, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, NOW())
       ON CONFLICT (id) DO UPDATE SET
         slug           = EXCLUDED.slug,
         event_slug     = EXCLUDED.event_slug,
         question       = EXCLUDED.question,
         description    = EXCLUDED.description,
         category       = EXCLUDED.category,
         tags           = EXCLUDED.tags,
         outcomes       = EXCLUDED.outcomes,
         volume         = EXCLUDED.volume,
         liquidity      = EXCLUDED.liquidity,
         end_date       = EXCLUDED.end_date,
         clob_token_ids = EXCLUDED.clob_token_ids,
         active         = EXCLUDED.active,
         updated_at     = NOW()`,
      [
        market.id,
        market.slug,
        market.eventSlug,
        market.question,
        market.description,
        market.category,
        market.tags,
        JSON.stringify(market.outcomes),
        market.volume,
        market.liquidity,
        market.endDate,
        market.clobTokenIds,
        market.active,
      ]
    );
  }

  /**
   * Rebuild the search-suggestion table from the active markets. Atomic via
   * DELETE + INSERT in a single statement so the dropdown never sees an
   * empty result mid-refresh.
   */
  static async refreshTagIndex(): Promise<number> {
    await query(`DELETE FROM tag_index`, []);
    const result = await query<{ tag: string }>(
      `INSERT INTO tag_index (tag, market_count)
       SELECT tag, COUNT(*)::int
       FROM markets, unnest(tags) AS tag
       WHERE active = TRUE
       GROUP BY tag
       RETURNING tag`,
      []
    );
    return result.rows.length;
  }

  /**
   * Look up tag suggestions by case-insensitive prefix, ordered by popularity.
   */
  static async getTagSuggestions(
    prefix: string,
    limit: number
  ): Promise<Array<{ tag: string; count: number }>> {
    if (prefix.length === 0) return [];
    const result = await query<{ tag: string; market_count: number }>(
      `SELECT tag, market_count
       FROM tag_index
       WHERE lower(tag) LIKE $1
       ORDER BY market_count DESC, tag ASC
       LIMIT $2`,
      [`${prefix.toLowerCase()}%`, limit]
    );
    return result.rows.map((r) => ({ tag: r.tag, count: r.market_count }));
  }

  /**
   * Delete markets whose end_date is in the past.
   * Returns the number of rows removed.
   */
  static async removeEndedMarkets(): Promise<number> {
    const result = await query(`DELETE FROM markets WHERE end_date < NOW() RETURNING id`, []);
    return result.rows.length;
  }

  /**
   * Full-featured search over the lean markets table.
   * When `q` is provided, uses Postgres tsvector for full-text search.
   * Supports category filter, volume/liquidity minimums, sort, and pagination.
   */
  /**
   * Build the (wheres, params) pair for searchMarkets / countMarkets so the
   * filter logic stays in one place.
   */
  private static buildSearchFilter(opts: SearchMarketsOptions): {
    wheres: string[];
    params: unknown[];
  } {
    const { q, category, categories, volumeMin = 0, liquidityMin = 0 } = opts;
    const wheres: string[] = ["active = TRUE", "volume >= $1", "liquidity >= $2"];
    const params: unknown[] = [volumeMin, liquidityMin];

    if (category) {
      params.push(category);
      wheres.push(`category = $${params.length}`);
    }
    if (categories && categories.length > 0) {
      params.push(categories);
      wheres.push(`category = ANY($${params.length}::text[])`);
    }
    if (q) {
      const tsq = buildPrefixTsQuery(q);
      if (tsq !== null) {
        params.push(tsq);
        wheres.push(`search_vec @@ to_tsquery('simple', $${params.length})`);
      }
    }
    return { wheres, params };
  }

  /**
   * Count markets matching the same filter that `searchMarkets` would apply.
   * Used for paginated UIs that need a "page X of Y".
   */
  static async countMarkets(opts: SearchMarketsOptions): Promise<number> {
    const { wheres, params } = this.buildSearchFilter(opts);
    const sql = `SELECT COUNT(*)::int AS total FROM markets WHERE ${wheres.join(" AND ")}`;
    const result = await query<{ total: number }>(sql, params);
    return result.rows[0]?.total ?? 0;
  }

  /**
   * Counts markets grouped by their primary category (the column), restricted
   * to the supplied set. Mirrors the strict filter that `searchMarkets` uses
   * with `category = $`, so the pill numbers match the rows you see when
   * clicking through.
   */
  static async getMarketCountsByCategory(categories: string[]): Promise<Record<string, number>> {
    if (categories.length === 0) return {};
    const result = await query<{ category: string; total: number }>(
      `SELECT category, COUNT(*)::int AS total
       FROM markets
       WHERE active = TRUE AND category = ANY($1::text[])
       GROUP BY category`,
      [categories]
    );
    const out: Record<string, number> = {};
    for (const c of categories) out[c] = 0;
    for (const row of result.rows) out[row.category] = row.total;
    return out;
  }

  static async searchMarkets(opts: SearchMarketsOptions): Promise<DatabaseMarket[]> {
    const {
      q,
      category,
      categories,
      volumeMin = 0,
      liquidityMin = 0,
      sort = "volume",
      limit = 50,
      offset = 0,
    } = opts;

    const wheres: string[] = ["active = TRUE", "volume >= $1", "liquidity >= $2"];
    const params: unknown[] = [volumeMin, liquidityMin];

    if (category) {
      params.push(category);
      wheres.push(`category = $${params.length}`);
    }

    if (categories && categories.length > 0) {
      params.push(categories);
      wheres.push(`category = ANY($${params.length}::text[])`);
    }

    // Interest score: log-scaled blend of trading activity, market depth and
    // closeness to resolution. Boosts deep, active markets that resolve soon
    // over thin or far-future ones — beats raw volume for "what's hot".
    const INTEREST_EXPR = `
      (LN(GREATEST(volume, 0) + 1) * 0.6 +
       LN(GREATEST(liquidity, 0) + 1) * 0.4) /
      (1 + GREATEST(EXTRACT(EPOCH FROM (end_date - NOW())) / 86400.0, 1) / 30.0)
    `;

    let orderBy: string;
    if (sort === "liquidity") {
      orderBy = "liquidity DESC";
    } else if (sort === "end_date") {
      orderBy = "end_date ASC";
    } else if (sort === "interest") {
      if (!category) {
        wheres.push("end_date > NOW() + INTERVAL '48 hours'");
        wheres.push(`volume >= ${INTEREST_MIN_VOLUME}`);
      }
      if (!q) {
        wheres.push(`question !~* '${INTEREST_NOISE_REGEX}'`);
      }
      const boostCases = !category
        ? Object.entries(INTEREST_CATEGORY_BOOSTS)
            .map(([cat, mult]) => `WHEN '${cat}' THEN ${mult}`)
            .join(" ")
        : "";
      const scoreExpr = boostCases
        ? `(${INTEREST_EXPR}) * (CASE category ${boostCases} ELSE 1 END)`
        : INTEREST_EXPR;
      orderBy = `${scoreExpr} DESC`;
    } else {
      orderBy = "volume DESC";
    }

    if (q) {
      const tsq = buildPrefixTsQuery(q);
      if (tsq !== null) {
        params.push(tsq);
        wheres.push(`search_vec @@ to_tsquery('simple', $${params.length})`);
      }
    }

    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const sql = `
      SELECT id, slug, event_slug, question, description, category, tags, outcomes, volume, liquidity, end_date, clob_token_ids, active, updated_at
      FROM markets
      WHERE ${wheres.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const result = await query<DatabaseMarket>(sql, params);
    return result.rows;
  }

  /**
   * Fetch a single market by its primary-key id.
   * Used by the existing order-creation routes until Phase 4 refactors them.
   */
  static async getMarketById(id: string): Promise<DatabaseMarket | null> {
    const result = await query<DatabaseMarket>(
      `SELECT id, slug, event_slug, question, description, category, tags, outcomes, volume, liquidity, end_date, clob_token_ids, active, updated_at
       FROM markets WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Fetch a single market by slug. Used by the order-creation flow to resolve
   * clob_token_ids when the frontend sends a slug instead of a raw token ID.
   */
  static async getMarketBySlug(slug: string): Promise<DatabaseMarket | null> {
    const result = await query<DatabaseMarket>(
      `SELECT id, slug, event_slug, question, description, category, tags, outcomes, volume, liquidity, end_date, clob_token_ids, active, updated_at
       FROM markets WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    return result.rows[0] ?? null;
  }

  // ============================================================
  // PolySwap Orders
  // ============================================================

  /**
   * Insert a polyswap order created via the frontend form (status = draft).
   * Returns the auto-generated row ID.
   */
  static async insertPolyswapOrderFromForm(orderData: {
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    minBuyAmount: string;
    startDate: string;
    deadline: string;
    marketId: string;
    owner: string;
    outcomeSelected: string;
    betPercentageValue: number;
    polymarketOrderHash: string;
    salt: string;
  }): Promise<number> {
    const sql = `
      INSERT INTO polyswap_orders (
        owner, sell_token, buy_token,
        sell_amount, min_buy_amount, start_time, end_time, market_id,
        outcome_selected, bet_percentage, polymarket_order_hash, salt, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
      RETURNING id
    `;

    const values = [
      orderData.owner.toLowerCase(),
      orderData.sellToken.toLowerCase(),
      orderData.buyToken.toLowerCase(),
      orderData.sellAmount,
      orderData.minBuyAmount,
      new Date(orderData.startDate),
      new Date(orderData.deadline),
      orderData.marketId,
      orderData.outcomeSelected,
      orderData.betPercentageValue,
      orderData.polymarketOrderHash,
      orderData.salt,
      "draft",
    ];

    try {
      const result = await query<{ id: number }>(sql, values);
      const orderId: number = result.rows[0]!.id;
      return orderId;
    } catch (error) {
      console.error(`❌ Database error inserting frontend order:`, error);
      throw error;
    }
  }

  /**
   * Insert a polyswap order sourced from a blockchain event (status = live).
   * Idempotent via ON CONFLICT (order_hash).
   */
  static async insertPolyswapOrder(order: PolyswapOrderRecord): Promise<void> {
    const sql = `
      INSERT INTO polyswap_orders (
        order_hash, owner, handler, sell_token, buy_token,
        sell_amount, min_buy_amount, start_time, end_time, polymarket_order_hash,
        app_data, block_number, transaction_hash, log_index, market_id,
        outcome_selected, bet_percentage, salt, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      )
      ON CONFLICT (order_hash) DO UPDATE SET
        owner                 = EXCLUDED.owner,
        handler               = EXCLUDED.handler,
        sell_token            = EXCLUDED.sell_token,
        buy_token             = EXCLUDED.buy_token,
        sell_amount           = EXCLUDED.sell_amount,
        min_buy_amount        = EXCLUDED.min_buy_amount,
        start_time            = EXCLUDED.start_time,
        end_time              = EXCLUDED.end_time,
        polymarket_order_hash = EXCLUDED.polymarket_order_hash,
        app_data              = EXCLUDED.app_data,
        block_number          = EXCLUDED.block_number,
        transaction_hash      = EXCLUDED.transaction_hash,
        log_index             = EXCLUDED.log_index,
        market_id             = EXCLUDED.market_id,
        outcome_selected      = EXCLUDED.outcome_selected,
        bet_percentage        = EXCLUDED.bet_percentage,
        salt                  = EXCLUDED.salt,
        status                = EXCLUDED.status,
        updated_at            = CURRENT_TIMESTAMP
    `;

    const blockNumber = Number(order.blockNumber);
    const logIndex = Number(order.logIndex);

    if (isNaN(blockNumber) || isNaN(logIndex)) {
      throw new Error(`Invalid numeric values: blockNumber=${blockNumber}, logIndex=${logIndex}`);
    }

    const values = [
      order.orderHash,
      order.owner.toLowerCase(),
      order.handler.toLowerCase(),
      order.sellToken.toLowerCase(),
      order.buyToken.toLowerCase(),
      order.sellAmount,
      order.minBuyAmount,
      new Date(order.startTime * 1000),
      new Date(order.endTime * 1000),
      order.polymarketOrderHash,
      order.appData,
      blockNumber,
      order.transactionHash,
      logIndex,
      null, // market_id — not available from blockchain events
      null, // outcome_selected — not available from blockchain events
      null, // bet_percentage — not available from blockchain events
      order.salt ?? null,
      "live",
    ];

    try {
      await query(sql, values);
    } catch (error) {
      console.error(`❌ Database error inserting order ${order.orderHash}:`, error);
      console.error("Order data:", {
        orderHash: order.orderHash,
        blockNumber,
        logIndex,
        transactionHash: order.transactionHash,
      });
      throw error;
    }
  }

  /**
   * Idempotent upsert from a ConditionalOrderCreated on-chain event.
   *
   * - If a draft row exists for (polymarket_order_hash, owner) → upgrade it to
   *   "live", fill in order_hash + tx coordinates. This is the standard path:
   *   the frontend creates the draft via POST /orders before signing, and the
   *   listener observes the event after the user signs and the tx mines.
   * - Otherwise → insert a fresh "live" row. This is the catch-up path: the
   *   listener saw the event but the draft was lost (e.g. backend was down
   *   when the user submitted, or the order was created by a non-frontend path).
   */
  static async upsertLiveOrderFromEvent(input: {
    owner: string;
    orderHash: string;
    handler: string;
    salt: string;
    data: PolyswapOrderData;
    blockNumber: number;
    transactionHash: string;
    logIndex: number;
  }): Promise<void> {
    const ownerLc = input.owner.toLowerCase();

    // 1. Try to upgrade an existing draft (matched by polymarket_order_hash + owner).
    const draftResult = await query<{ id: number }>(
      `SELECT id FROM polyswap_orders
       WHERE polymarket_order_hash = $1 AND owner = $2 AND status = 'draft'
       LIMIT 1`,
      [input.data.polymarketOrderHash, ownerLc]
    );

    if (draftResult.rows[0]) {
      await query(
        `UPDATE polyswap_orders SET
           status = 'live',
           order_hash = $1,
           handler = $2,
           transaction_hash = $3,
           block_number = $4,
           log_index = $5,
           app_data = $6,
           salt = $7,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $8`,
        [
          input.orderHash,
          input.handler.toLowerCase(),
          input.transactionHash,
          input.blockNumber,
          input.logIndex,
          input.data.appData,
          input.salt,
          draftResult.rows[0].id,
        ]
      );
      return;
    }

    // 2. Catch-up insert. Reuse existing upsert-on-order_hash via insertPolyswapOrder.
    await this.insertPolyswapOrder({
      orderHash: input.orderHash,
      owner: ownerLc,
      handler: input.handler.toLowerCase(),
      sellToken: input.data.sellToken,
      buyToken: input.data.buyToken,
      sellAmount: input.data.sellAmount,
      minBuyAmount: input.data.minBuyAmount,
      startTime: parseInt(input.data.t0, 10),
      endTime: parseInt(input.data.t, 10),
      polymarketOrderHash: input.data.polymarketOrderHash,
      appData: input.data.appData,
      blockNumber: input.blockNumber,
      transactionHash: input.transactionHash,
      logIndex: input.logIndex,
      createdAt: new Date(),
      salt: input.salt,
    });
  }

  /**
   * Get polyswap orders by owner address (empty string = all orders).
   */
  static async getPolyswapOrdersByOwner(
    ownerAddress: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<DatabasePolyswapOrder[]> {
    if (ownerAddress && ownerAddress.trim() !== "") {
      const result = await query<DatabasePolyswapOrder>(
        `SELECT * FROM polyswap_orders WHERE owner = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [ownerAddress.toLowerCase(), limit, offset]
      );
      return result.rows;
    }
    const result = await query<DatabasePolyswapOrder>(
      `SELECT * FROM polyswap_orders ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  /**
   * Get a polyswap order by its keccak256 order hash.
   */
  static async getPolyswapOrderByHash(orderHash: string): Promise<DatabasePolyswapOrder | null> {
    const result = await query<DatabasePolyswapOrder>(
      `SELECT * FROM polyswap_orders WHERE order_hash = $1`,
      [orderHash]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Get a polyswap order by its auto-increment ID.
   */
  static async getPolyswapOrderById(id: number): Promise<DatabasePolyswapOrder | null> {
    const result = await query<DatabasePolyswapOrder>(
      `SELECT * FROM polyswap_orders WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Returns the latest block the listener has finished processing.
   * Prefers the persisted cursor in `listener_state`; falls back to
   * MAX(block_number) of polyswap_orders for first-run / pre-cursor envs.
   */
  static async getLatestProcessedBlock(): Promise<number> {
    const stateResult = await query<{ value: string | number | null }>(
      `SELECT value FROM listener_state WHERE key = $1`,
      ["last_processed_block"]
    );
    const cursor = stateResult.rows[0]?.value;
    if (cursor !== undefined && cursor !== null) {
      return Number(cursor);
    }

    const fallback = await query<{ latest_block: number | null }>(
      `SELECT MAX(block_number) as latest_block FROM polyswap_orders`,
      []
    );
    return fallback.rows[0]?.latest_block ?? 0;
  }

  /**
   * Persist the listener cursor. Called after each catch-up batch so the
   * next start-up can resume from the right block, even if no orders fell
   * inside the window.
   */
  static async setLatestProcessedBlock(blockNumber: number): Promise<void> {
    await query(
      `INSERT INTO listener_state (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_at = CURRENT_TIMESTAMP`,
      ["last_processed_block", blockNumber]
    );
  }

  /**
   * Get orders in a given block range, ordered by block then log index.
   */
  static async getPolyswapOrdersByBlockRange(
    fromBlock: number,
    toBlock: number
  ): Promise<DatabasePolyswapOrder[]> {
    const result = await query<DatabasePolyswapOrder>(
      `SELECT * FROM polyswap_orders WHERE block_number >= $1 AND block_number <= $2 ORDER BY block_number ASC, log_index ASC`,
      [fromBlock, toBlock]
    );
    return result.rows;
  }

  /**
   * Get orders by their Polymarket counterpart order hash.
   */
  static async getPolyswapOrdersByPolymarketHash(
    polymarketHash: string
  ): Promise<DatabasePolyswapOrder[]> {
    const result = await query<DatabasePolyswapOrder>(
      `SELECT * FROM polyswap_orders WHERE polymarket_order_hash = $1 ORDER BY created_at DESC`,
      [polymarketHash]
    );
    return result.rows;
  }

  /**
   * Update an order's status by order_hash.
   */
  static async updateOrderStatus(
    orderHash: string,
    status: "draft" | "live" | "filled" | "canceled"
  ): Promise<boolean> {
    try {
      const result = await query<DatabasePolyswapOrder>(
        `UPDATE polyswap_orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_hash = $2 RETURNING order_hash`,
        [status, orderHash]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error(`❌ Error updating order status for ${orderHash}:`, error);
      return false;
    }
  }

  /**
   * Update an order's status by numeric ID, with optional fill details.
   */
  static async updateOrderStatusById(
    orderId: number,
    status: "draft" | "live" | "filled" | "canceled" | "errored",
    fillDetails?: {
      filledAt?: Date;
      fillTransactionHash?: string;
      fillBlockNumber?: number;
      fillLogIndex?: number;
      actualSellAmount?: string;
      actualBuyAmount?: string;
      feeAmount?: string;
    }
  ): Promise<boolean> {
    let sql = `UPDATE polyswap_orders SET status = $1, updated_at = CURRENT_TIMESTAMP`;
    const values: unknown[] = [status];
    let paramIndex = 2;

    if (fillDetails) {
      if (fillDetails.filledAt) {
        sql += `, filled_at = $${paramIndex}`;
        values.push(fillDetails.filledAt);
        paramIndex++;
      }
      if (fillDetails.fillTransactionHash) {
        sql += `, fill_transaction_hash = $${paramIndex}`;
        values.push(fillDetails.fillTransactionHash);
        paramIndex++;
      }
      if (fillDetails.fillBlockNumber) {
        sql += `, fill_block_number = $${paramIndex}`;
        values.push(fillDetails.fillBlockNumber);
        paramIndex++;
      }
      if (fillDetails.fillLogIndex) {
        sql += `, fill_log_index = $${paramIndex}`;
        values.push(fillDetails.fillLogIndex);
        paramIndex++;
      }
      if (fillDetails.actualSellAmount) {
        sql += `, actual_sell_amount = $${paramIndex}`;
        values.push(fillDetails.actualSellAmount);
        paramIndex++;
      }
      if (fillDetails.actualBuyAmount) {
        sql += `, actual_buy_amount = $${paramIndex}`;
        values.push(fillDetails.actualBuyAmount);
        paramIndex++;
      }
      if (fillDetails.feeAmount) {
        sql += `, fee_amount = $${paramIndex}`;
        values.push(fillDetails.feeAmount);
        paramIndex++;
      }
    }

    sql += ` WHERE id = $${paramIndex} RETURNING id`;
    values.push(orderId);

    try {
      const result = await query(sql, values);
      return result.rows.length > 0;
    } catch (error) {
      console.error(`❌ Error updating order status for ID ${orderId}:`, error);
      return false;
    }
  }

  /**
   * Persist a CoW conditional-order poll error onto a row. Used by the
   * orderHealthCheck cron when getTradeableOrderWithSignature reverts.
   */
  static async setOrderError(
    id: number,
    errorName: string,
    reason: string,
    retryAt: number | null
  ): Promise<void> {
    await query(
      `UPDATE polyswap_orders
       SET last_error_name = $1, last_error_reason = $2, last_error_retry_at = $3,
           last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [errorName, reason, retryAt, id]
    );
  }

  /**
   * Wipe error diagnostics from a row (used when the order becomes fillable
   * again after a transient revert).
   */
  static async clearOrderError(id: number): Promise<void> {
    await query(
      `UPDATE polyswap_orders
       SET last_error_name = NULL, last_error_reason = NULL, last_error_retry_at = NULL,
           last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
  }

  /**
   * Persist the discrete CoW orderbook status for an order (open, fulfilled,
   * cancelled, expired, presignaturePending).
   */
  static async setCowOrderStatus(id: number, status: string): Promise<boolean> {
    const result = await query(
      `UPDATE polyswap_orders
       SET cow_order_status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING id`,
      [status, id]
    );
    return result.rows.length > 0;
  }

  /**
   * Delete a polyswap order by its numeric ID.
   */
  static async deletePolyswapOrderById(id: number): Promise<void> {
    await query(`DELETE FROM polyswap_orders WHERE id = $1`, [id]);
  }

  /**
   * Drafts created before `cutoff` — used by the listener's draft-janitor cron
   * to sweep orders the user never finished signing on-chain.
   */
  static async findDraftsOlderThan(cutoff: Date): Promise<DatabasePolyswapOrder[]> {
    const result = await query<DatabasePolyswapOrder>(
      `SELECT * FROM polyswap_orders WHERE status = 'draft' AND created_at < $1 ORDER BY created_at ASC`,
      [cutoff]
    );
    return result.rows;
  }

  /**
   * Update the Polymarket order hash on a draft order (by on-chain order_hash).
   */
  static async updateOrderPolymarketHash(
    orderHash: string,
    polymarketOrderHash: string
  ): Promise<boolean> {
    try {
      const result = await query(
        `UPDATE polyswap_orders SET polymarket_order_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE order_hash = $2 RETURNING order_hash`,
        [polymarketOrderHash, orderHash]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error(`❌ Error updating Polymarket order hash for ${orderHash}:`, error);
      return false;
    }
  }

  /**
   * Update the Polymarket order hash on a draft order (by numeric ID).
   */
  static async updateOrderPolymarketHashById(
    orderId: number,
    polymarketOrderHash: string
  ): Promise<boolean> {
    try {
      const result = await query(
        `UPDATE polyswap_orders SET polymarket_order_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id`,
        [polymarketOrderHash, orderId]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error(`❌ Error updating Polymarket order hash for order ID ${orderId}:`, error);
      return false;
    }
  }

  /**
   * Set transaction_hash and advance status to 'live' (by numeric ID).
   */
  static async updateOrderTransactionHashById(
    orderId: number,
    transactionHash: string
  ): Promise<boolean> {
    try {
      const result = await query(
        `UPDATE polyswap_orders SET transaction_hash = $1, status = 'live', updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id`,
        [transactionHash, orderId]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error(`❌ Error updating transaction hash for order ID ${orderId}:`, error);
      return false;
    }
  }

  /**
   * Get orders filtered by status.
   */
  static async getOrdersByStatus(
    status: "draft" | "live" | "filled" | "canceled",
    limit: number = 100,
    offset: number = 0
  ): Promise<DatabasePolyswapOrder[]> {
    const result = await query<DatabasePolyswapOrder>(
      `SELECT * FROM polyswap_orders WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    return result.rows;
  }

  /**
   * Get a polyswap order by order_hash AND owner (used by the cancel endpoint to verify ownership).
   */
  static async getPolyswapOrderByHashAndOwner(
    orderHash: string,
    ownerAddress: string
  ): Promise<DatabasePolyswapOrder | null> {
    const result = await query<DatabasePolyswapOrder>(
      `SELECT * FROM polyswap_orders WHERE order_hash = $1 AND owner = $2`,
      [orderHash, ownerAddress.toLowerCase()]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Set full on-chain transaction details on an order (called by listener catch-up path).
   */
  static async updateOrderTransactionDetails(
    orderId: number,
    transactionHash: string,
    blockNumber: number,
    logIndex: number,
    handler: string,
    appData: string,
    orderHash: string,
    orderUid?: string
  ): Promise<boolean> {
    const sql = `
      UPDATE polyswap_orders SET
        transaction_hash = $1,
        block_number     = $2,
        log_index        = $3,
        handler          = $4,
        app_data         = $5,
        order_hash       = $6,
        order_uid        = $7,
        status           = 'live',
        updated_at       = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING id
    `;
    try {
      const result = await query(sql, [
        transactionHash,
        blockNumber,
        logIndex,
        handler.toLowerCase(),
        appData,
        orderHash,
        orderUid ?? null,
        orderId,
      ]);
      return result.rows.length > 0;
    } catch (error) {
      console.error(`❌ Error updating transaction details for order ID ${orderId}:`, error);
      return false;
    }
  }

  /**
   * Attach a CoW Protocol order UID to an existing order.
   */
  static async updateOrderUid(orderHash: string, orderUid: string): Promise<boolean> {
    try {
      const result = await query(
        `UPDATE polyswap_orders SET order_uid = $1, updated_at = CURRENT_TIMESTAMP WHERE order_hash = $2 RETURNING order_hash`,
        [orderUid, orderHash]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error(`❌ Error updating order UID for ${orderHash}:`, error);
      return false;
    }
  }

  /**
   * Get a polyswap order by its CoW Protocol order UID.
   */
  static async getPolyswapOrderByUid(orderUid: string): Promise<DatabasePolyswapOrder | null> {
    try {
      const result = await query<DatabasePolyswapOrder>(
        `SELECT * FROM polyswap_orders WHERE order_uid = $1`,
        [orderUid]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      console.error(`❌ Error fetching order by UID ${orderUid}:`, error);
      return null;
    }
  }

  /**
   * Get live orders that do not yet have a CoW Protocol order UID.
   */
  static async getLiveOrdersWithoutUid(): Promise<DatabasePolyswapOrder[]> {
    try {
      const result = await query<DatabasePolyswapOrder>(
        `SELECT * FROM polyswap_orders WHERE status = 'live' AND (order_uid IS NULL OR order_uid = '') ORDER BY created_at ASC`,
        []
      );
      return result.rows;
    } catch (error) {
      console.error("❌ Error fetching live orders without UID:", error);
      return [];
    }
  }

  /**
   * Get all live orders.
   */
  static async getLiveOrders(): Promise<DatabasePolyswapOrder[]> {
    try {
      const result = await query<DatabasePolyswapOrder>(
        `SELECT * FROM polyswap_orders WHERE status = 'live' ORDER BY created_at ASC`,
        []
      );
      return result.rows;
    } catch (error) {
      console.error("❌ Error fetching live orders:", error);
      return [];
    }
  }

  /**
   * Get all polyswap orders regardless of status.
   */
  static async getAllPolyswapOrders(): Promise<DatabasePolyswapOrder[]> {
    try {
      const result = await query<DatabasePolyswapOrder>(
        `SELECT * FROM polyswap_orders ORDER BY created_at ASC`,
        []
      );
      return result.rows;
    } catch (error) {
      console.error("❌ Error fetching all orders:", error);
      return [];
    }
  }

  // ============================================================
  // Sold Positions (Position Seller ledger — unchanged)
  // ============================================================

  static async recordSoldPosition(input: SoldPositionInput): Promise<number> {
    const sql = `
      INSERT INTO sold_positions (
        asset_id, condition_id, size, sell_price, current_price,
        order_id, market_title, outcome
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;
    try {
      const result = await query<{ id: number }>(sql, [
        input.assetId,
        input.conditionId,
        input.size,
        input.sellPrice,
        input.currentPrice,
        input.orderId,
        input.marketTitle,
        input.outcome,
      ]);
      const id: number = result.rows[0]!.id;
      return id;
    } catch (error) {
      console.error("❌ Error recording sold position:", error);
      throw error;
    }
  }

  static async getRecentlySoldPositions(hoursAgo: number = 24): Promise<SoldPosition[]> {
    try {
      const result = await query<SoldPosition>(
        `SELECT * FROM sold_positions WHERE sold_at > NOW() - INTERVAL '${hoursAgo} hours' ORDER BY sold_at DESC`,
        []
      );
      return result.rows;
    } catch (error) {
      console.error("❌ Error fetching recently sold positions:", error);
      return [];
    }
  }

  static async getSoldPositionByAsset(assetId: string): Promise<SoldPosition | null> {
    try {
      const result = await query<SoldPosition>(
        `SELECT * FROM sold_positions WHERE asset_id = $1 ORDER BY sold_at DESC LIMIT 1`,
        [assetId]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      console.error("❌ Error fetching sold position by asset:", error);
      return null;
    }
  }

  static async getAllSoldPositions(
    limit: number = 100,
    offset: number = 0
  ): Promise<SoldPosition[]> {
    try {
      const result = await query<SoldPosition>(
        `SELECT * FROM sold_positions ORDER BY sold_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      return result.rows;
    } catch (error) {
      console.error("❌ Error fetching all sold positions:", error);
      return [];
    }
  }

  static async getSoldPositionsStats(): Promise<{
    totalSold: number;
    totalValue: number;
    last24Hours: number;
  }> {
    try {
      const result = await query<{
        total_sold: string;
        total_value: string;
        last_24_hours: string;
      }>(
        `SELECT COUNT(*) as total_sold,
                COALESCE(SUM(size * sell_price), 0) as total_value,
                COUNT(CASE WHEN sold_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24_hours
         FROM sold_positions`,
        []
      );
      const row = result.rows[0];
      return {
        totalSold: parseInt(row?.total_sold ?? "0"),
        totalValue: parseFloat(row?.total_value ?? "0"),
        last24Hours: parseInt(row?.last_24_hours ?? "0"),
      };
    } catch (error) {
      console.error("❌ Error fetching sold positions stats:", error);
      return { totalSold: 0, totalValue: 0, last24Hours: 0 };
    }
  }

  static async cleanupOldSoldPositions(daysOld: number = 30): Promise<number> {
    try {
      const result = await query<SoldPosition>(
        `DELETE FROM sold_positions WHERE sold_at < NOW() - INTERVAL '${daysOld} days'`,
        []
      );
      return result.rowCount ?? 0;
    } catch (error) {
      console.error("❌ Error cleaning up old sold positions:", error);
      return 0;
    }
  }

  static async deleteSoldPositionByOrderId(orderId: string): Promise<boolean> {
    try {
      const result = await query<SoldPosition>(`DELETE FROM sold_positions WHERE order_id = $1`, [
        orderId,
      ]);
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error("❌ Error deleting sold position by order ID:", error);
      return false;
    }
  }

  static async deleteSoldPositionByAssetId(assetId: string): Promise<number> {
    try {
      const result = await query<SoldPosition>(`DELETE FROM sold_positions WHERE asset_id = $1`, [
        assetId,
      ]);
      return result.rowCount ?? 0;
    } catch (error) {
      console.error("❌ Error deleting sold position by asset ID:", error);
      return 0;
    }
  }

  static async cleanupFailedSoldPositions(): Promise<number> {
    try {
      const result = await query<SoldPosition>(
        `DELETE FROM sold_positions WHERE order_id = 'unknown' OR order_id IS NULL`,
        []
      );
      const count: number = result.rowCount ?? 0;
      if (count > 0) {
        console.log(`🧹 Cleaned up ${count} failed sold position record(s)`);
      }
      return count;
    } catch (error) {
      console.error("❌ Error cleaning up failed sold positions:", error);
      return 0;
    }
  }
}
