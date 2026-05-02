import { query } from "../db/database";
import { type Market } from "../interfaces/Market";
import { type DatabaseMarket } from "../interfaces/Database";
import {
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
  volumeMin?: number;
  liquidityMin?: number;
  sort?: "volume" | "liquidity" | "end_date";
  limit?: number;
  offset?: number;
}

export class DatabaseService {
  // ============================================================
  // Markets — lean search-index
  // ============================================================

  /**
   * Upsert a single market into the lean search-index table.
   * Uses ON CONFLICT (id) so re-running the market sync is idempotent.
   */
  static async upsertMarket(market: Market): Promise<void> {
    await query(
      `INSERT INTO markets (id, slug, question, category, volume, liquidity, end_date, clob_token_ids, active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (id) DO UPDATE SET
         slug           = EXCLUDED.slug,
         question       = EXCLUDED.question,
         category       = EXCLUDED.category,
         volume         = EXCLUDED.volume,
         liquidity      = EXCLUDED.liquidity,
         end_date       = EXCLUDED.end_date,
         clob_token_ids = EXCLUDED.clob_token_ids,
         active         = EXCLUDED.active,
         updated_at     = NOW()`,
      [
        market.id,
        market.slug,
        market.question,
        market.category,
        market.volume,
        market.liquidity,
        market.endDate,
        market.clobTokenIds, // TEXT[] — pg driver maps JS string[] directly
        market.active,
      ]
    );
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
  static async searchMarkets(opts: SearchMarketsOptions): Promise<DatabaseMarket[]> {
    const {
      q,
      category,
      volumeMin = 0,
      liquidityMin = 0,
      sort = "volume",
      limit = 50,
      offset = 0,
    } = opts;

    const wheres: string[] = ["active = TRUE", "volume >= $1", "liquidity >= $2"];
    // params index starts at 3 after the two floor params above
    const params: unknown[] = [volumeMin, liquidityMin];

    if (category) {
      params.push(category);
      wheres.push(`category = $${params.length}`);
    }

    let orderBy: string;
    if (sort === "liquidity") {
      orderBy = "liquidity DESC";
    } else if (sort === "end_date") {
      orderBy = "end_date ASC";
    } else {
      orderBy = "volume DESC";
    }

    if (q) {
      params.push(q);
      const qIdx = params.length;
      wheres.push(`search_vec @@ plainto_tsquery('english', $${qIdx})`);
      // When full-text query is present, rank by relevance then volume tiebreaker.
      // qIdx is referenced twice: once for the filter (above) and once here for ts_rank.
      orderBy = `ts_rank(search_vec, plainto_tsquery('english', $${qIdx})) DESC, volume DESC`;
    }

    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const sql = `
      SELECT id, slug, question, category, volume, liquidity, end_date, clob_token_ids, active, updated_at
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
      `SELECT id, slug, question, category, volume, liquidity, end_date, clob_token_ids, active, updated_at
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
      `SELECT id, slug, question, category, volume, liquidity, end_date, clob_token_ids, active, updated_at
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
  }): Promise<number> {
    const sql = `
      INSERT INTO polyswap_orders (
        owner, sell_token, buy_token,
        sell_amount, min_buy_amount, start_time, end_time, market_id,
        outcome_selected, bet_percentage, polymarket_order_hash, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
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
        outcome_selected, bet_percentage, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
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
   * Returns the highest block_number seen across all orders (for listener catch-up).
   */
  static async getLatestProcessedBlock(): Promise<number> {
    const result = await query<{ latest_block: number | null }>(
      `SELECT MAX(block_number) as latest_block FROM polyswap_orders`,
      []
    );
    return result.rows[0]?.latest_block ?? 0;
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
    status: "draft" | "live" | "filled" | "canceled",
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
