import { query } from '../db/database';
import { Market } from '../interfaces/Market';
import { DatabaseMarket } from '../interfaces/Database';
import { PolyswapOrderRecord, DatabasePolyswapOrder } from '../interfaces/PolyswapOrder';

export class DatabaseService {
  
  /**
   * Extract category from market question
   */
  private static extractCategory(question: string): string {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('bitcoin') || lowerQuestion.includes('ethereum') || lowerQuestion.includes('crypto') || lowerQuestion.includes('eth') || lowerQuestion.includes('btc')) {
      return 'crypto';
    } else if (lowerQuestion.includes('trump') || lowerQuestion.includes('biden') || lowerQuestion.includes('election') || lowerQuestion.includes('president') || lowerQuestion.includes('politics')) {
      return 'politics';
    } else if (lowerQuestion.includes('fed') || lowerQuestion.includes('interest') || lowerQuestion.includes('recession') || lowerQuestion.includes('economy') || lowerQuestion.includes('inflation')) {
      return 'economics';
    } else if (lowerQuestion.includes('champion') || lowerQuestion.includes('series') || lowerQuestion.includes('sport') || lowerQuestion.includes('f1') || lowerQuestion.includes('football') || lowerQuestion.includes('basketball')) {
      return 'sports';
    } else if (lowerQuestion.includes('movie') || lowerQuestion.includes('film') || lowerQuestion.includes('entertainment')) {
      return 'entertainment';
    } else if (lowerQuestion.includes('china') || lowerQuestion.includes('russia') || lowerQuestion.includes('ukraine') || lowerQuestion.includes('iran') || lowerQuestion.includes('war')) {
      return 'world';
    } else if (lowerQuestion.includes('ai') || lowerQuestion.includes('artificial intelligence') || lowerQuestion.includes('technology')) {
      return 'technology';
    } else {
      return 'other';
    }
  }

  /**
   * Insert a new market into the database with only essential fields
   */
  static async insertMarket(market: Market): Promise<void> {
    // Validate required fields first - skip market if any required field is null/invalid
    if (!market.id || !market.question || !market.conditionId || !market.startDate || !market.endDate) {
      console.warn(`Skipping market ${market.id || 'unknown'}: Missing required basic fields`);
      return;
    }

    // Validate outcomes and outcomePrices are not null and are valid
    if (!market.outcomes || !market.outcomePrices) {
      console.warn(`Skipping market ${market.id}: Missing required outcomes or outcomePrices (outcomes: ${!!market.outcomes}, outcomePrices: ${!!market.outcomePrices})`);
      return;
    }

    let outcomesData;
    let pricesData;
    
    try {
      // Parse outcomes data
      outcomesData = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes;
      
      // Parse outcome prices data
      pricesData = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : market.outcomePrices;

      // Validate parsed data
      if (!Array.isArray(outcomesData) || outcomesData.length === 0) {
        console.warn(`Skipping market ${market.id}: Invalid outcomes data - not a valid array`);
        return;
      }
      
      if (!Array.isArray(pricesData) || pricesData.length === 0) {
        console.warn(`Skipping market ${market.id}: Invalid outcomePrices data - not a valid array`);
        return;
      }

      // Ensure prices array matches outcomes array length
      if (pricesData.length !== outcomesData.length) {
        console.warn(`Skipping market ${market.id}: Mismatched outcomes/prices lengths (outcomes: ${outcomesData.length}, prices: ${pricesData.length})`);
        return;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Skipping market ${market.id}: Error parsing outcomes or prices data - ${errorMessage}`);
      return;
    }

    const sql = `
      INSERT INTO markets (
        id, question, condition_id, slug, category, start_date, end_date, volume, outcomes, outcome_prices, clob_token_ids
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )
      ON CONFLICT (condition_id) DO UPDATE SET
        question = EXCLUDED.question,
        slug = EXCLUDED.slug,
        category = EXCLUDED.category,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        volume = EXCLUDED.volume,
        outcomes = EXCLUDED.outcomes,
        outcome_prices = EXCLUDED.outcome_prices,
        clob_token_ids = EXCLUDED.clob_token_ids,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    const values = [
      market.id,
      market.question,
      market.conditionId,
      market.slug,
      this.extractCategory(market.question),
      new Date(market.startDate),
      new Date(market.endDate),
      parseFloat(market.volume) || 0,
      JSON.stringify(outcomesData),
      JSON.stringify(pricesData),
      JSON.stringify(market.clobTokenIds)
    ];

    try {
      await query(sql, values);
    } catch (error) {
      console.error(`Failed to insert market ${market.id}:`, error);
      throw error;
    }
  }

  /**
   * Get market by condition ID
   */
  static async getMarketByConditionId(conditionId: string): Promise<DatabaseMarket | null> {
    const sql = 'SELECT * FROM markets WHERE condition_id = $1';
    const result = await query(sql, [conditionId]);
    return result.rows[0] || null;
  }

  /**
   * Get market by ID
   */
  static async getMarketById(id: string): Promise<DatabaseMarket | null> {
    const sql = 'SELECT * FROM markets WHERE id = $1';
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Get all markets from the database with pagination
   */
  static async getAllMarkets(limit: number = 100, offset: number = 0): Promise<DatabaseMarket[]> {
    const sql = 'SELECT * FROM markets ORDER BY created_at DESC LIMIT $1 OFFSET $2';
    const result = await query(sql, [limit, offset]);
    return result.rows;
  }

  /**
   * Get top markets by volume
   */
  static async getTopMarkets(limit: number = 50): Promise<DatabaseMarket[]> {
    const sql = 'SELECT * FROM markets ORDER BY volume DESC LIMIT $1';
    const result = await query(sql, [limit]);
    return result.rows;
  }

  /**
   * Search markets by question
   */
  static async searchMarkets(searchTerm: string, limit: number = 100): Promise<DatabaseMarket[]> {
    const sql = `
      SELECT * FROM markets 
      WHERE question ILIKE $1 
      ORDER BY volume DESC 
      LIMIT $2
    `;
    const result = await query(sql, [`%${searchTerm}%`, limit]);
    return result.rows;
  }

  /**
   * Search markets by keywords (AND search - all keywords must be present)
   */
  static async searchMarketsByKeywords(keywords: string[], limit: number = 100, offset: number = 0): Promise<DatabaseMarket[]> {
    const conditions = keywords.map((_, index) => `question ILIKE $${index + 1}`).join(' AND ');
    const sql = `
      SELECT * FROM markets 
      WHERE ${conditions}
      ORDER BY volume DESC 
      LIMIT $${keywords.length + 1} OFFSET $${keywords.length + 2}
    `;
    const values = [...keywords.map(k => `%${k}%`), limit, offset];
    const result = await query(sql, values);
    return result.rows;
  }

  /**
   * Search markets by any keyword (OR search - any keyword can match)
   */
  static async searchMarketsByAnyKeyword(keywords: string[], limit: number = 100, offset: number = 0): Promise<DatabaseMarket[]> {
    const conditions = keywords.map((_, index) => `question ILIKE $${index + 1}`).join(' OR ');
    const sql = `
      SELECT * FROM markets 
      WHERE ${conditions}
      ORDER BY volume DESC 
      LIMIT $${keywords.length + 1} OFFSET $${keywords.length + 2}
    `;
    const values = [...keywords.map(k => `%${k}%`), limit, offset];
    const result = await query(sql, values);
    return result.rows;
  }

  /**
   * Search markets by keywords AND category (AND search - all keywords must be present)
   */
  static async searchMarketsByKeywordsAndCategory(keywords: string[], category: string, limit: number = 100, offset: number = 0): Promise<DatabaseMarket[]> {
    const conditions = keywords.map((_, index) => `question ILIKE $${index + 1}`).join(' AND ');
    const sql = `
      SELECT * FROM markets 
      WHERE ${conditions} AND category = $${keywords.length + 1}
      ORDER BY volume DESC 
      LIMIT $${keywords.length + 2} OFFSET $${keywords.length + 3}
    `;
    const values = [...keywords.map(k => `%${k}%`), category, limit, offset];
    const result = await query(sql, values);
    return result.rows;
  }

  /**
   * Search markets by any keyword AND category (OR search - any keyword can match)
   */
  static async searchMarketsByAnyKeywordAndCategory(keywords: string[], category: string, limit: number = 100, offset: number = 0): Promise<DatabaseMarket[]> {
    const conditions = keywords.map((_, index) => `question ILIKE $${index + 1}`).join(' OR ');
    const sql = `
      SELECT * FROM markets 
      WHERE (${conditions}) AND category = $${keywords.length + 1}
      ORDER BY volume DESC 
      LIMIT $${keywords.length + 2} OFFSET $${keywords.length + 3}
    `;
    const values = [...keywords.map(k => `%${k}%`), category, limit, offset];
    const result = await query(sql, values);
    return result.rows;
  }

  /**
   * Get markets by volume threshold
   */
  static async getMarketsByVolume(minVolume: number, limit: number = 100, offset: number = 0): Promise<DatabaseMarket[]> {
    const sql = `
      SELECT * FROM markets 
      WHERE volume >= $1 
      ORDER BY volume DESC 
      LIMIT $2 OFFSET $3
    `;
    const result = await query(sql, [minVolume, limit, offset]);
    return result.rows;
  }

  /**
   * Get markets by question (partial word matching, case-insensitive)
   */
    static async getMarketsByQuestion(question: string): Promise<DatabaseMarket[]> {
        const sql = 'SELECT * FROM markets WHERE LOWER(question) LIKE LOWER($1) ORDER BY created_at DESC';
        const searchPattern = `%${question}%`;
        const result = await query(sql, [searchPattern]);
        return result.rows;
    }

  /**
   * Get market by slug
   */
  static async getMarketBySlug(slug: string): Promise<DatabaseMarket | null> {
    const sql = 'SELECT * FROM markets WHERE slug = $1';
    const result = await query(sql, [slug]);
    if (result.rows.length > 0) {
      return result.rows[0];
    } else {
      return null;
    }
  }

  /**
   * Get markets ending after a specific date with pagination
   */
  static async getMarketsEndingAfter(endDate: Date, limit: number = 100, offset: number = 0): Promise<DatabaseMarket[]> {
    const sql = `
      SELECT * FROM markets 
      WHERE end_date > $1 
      ORDER BY end_date ASC 
      LIMIT $2 OFFSET $3
    `;
    const result = await query(sql, [endDate, limit, offset]);
    return result.rows;
  }

  /**
   * Get markets by category
   */
  static async getMarketsByCategory(category: string, limit: number = 100, offset: number = 0): Promise<DatabaseMarket[]> {
    const sql = `
      SELECT * FROM markets 
      WHERE category = $1 
      ORDER BY volume DESC 
      LIMIT $2 OFFSET $3
    `;
    const result = await query(sql, [category, limit, offset]);
    return result.rows;
  }

  /**
   * Get markets by CLOB token ID
   */
  static async getMarketsByClobTokenId(clobTokenId: string): Promise<DatabaseMarket[]> {
    const sql = `
      SELECT * FROM markets 
      WHERE clob_token_ids::text LIKE $1 
      ORDER BY volume DESC
    `;
    const result = await query(sql, [`%${clobTokenId}%`]);
    return result.rows;
  }

  /**
   * Delete a market by condition ID
   */
  static async deleteMarket(conditionId: string): Promise<boolean> {
    const sql = 'DELETE FROM markets WHERE condition_id = $1';
    const result = await query(sql, [conditionId]);
    return result.rowCount > 0;
  }

  /**
   * Remove all markets that have ended (past their end_date)
   */
  static async removeClosedMarkets(): Promise<number> {
    const sql = 'DELETE FROM markets WHERE end_date < CURRENT_TIMESTAMP';
    const result = await query(sql);
    return result.rowCount || 0;
  }

  /**
   * Remove markets that ended before a specific date
   */
  static async removeMarketsEndedBefore(beforeDate: Date): Promise<number> {
    const sql = 'DELETE FROM markets WHERE end_date < $1';
    const result = await query(sql, [beforeDate]);
    return result.rowCount || 0;
  }

  /**
   * Insert multiple markets at once
   */
  static async insertMarkets(markets: Market[]): Promise<void> {
    if (markets.length === 0) return;

    for (const market of markets) {
      try {
        // Use the same validation logic as insertMarket - skip if invalid
        await this.insertMarket(market);
      } catch (error) {
        console.error(`Error inserting market ${market.id}:`, error);
        // Continue with other markets even if one fails
      }
    }
  }

  /**
   * Get market statistics
   */
  static async getMarketStats(): Promise<{
    totalMarkets: number;
    totalVolume: number;
    avgVolume: number;
    marketsEndingToday: number;
  }> {
    const sql = `
      SELECT 
        COUNT(*) as total_markets,
        COALESCE(SUM(volume), 0) as total_volume,
        COALESCE(AVG(volume), 0) as avg_volume,
        COUNT(CASE WHEN DATE(end_date) = CURRENT_DATE THEN 1 END) as markets_ending_today
      FROM markets
    `;
    const result = await query(sql);
    const row = result.rows[0];
    
    return {
      totalMarkets: parseInt(row.total_markets),
      totalVolume: parseFloat(row.total_volume),
      avgVolume: parseFloat(row.avg_volume),
      marketsEndingToday: parseInt(row.markets_ending_today)
    };
  }

  /**
   * Insert a polyswap order from frontend form
   */
  static async insertPolyswapOrderFromForm(orderData: {
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    minBuyAmount: string;
    selectedOutcome: string;
    betPercentage: string;
    startDate: string;
    deadline: string;
    marketId: string;
    marketTitle?: string;
    marketDescription?: string;
    polymarketOrderHash: string;
    owner: string;
  }): Promise<string> {
    // Generate a unique order hash (in production, this would come from the smart contract)
    const orderHash = `0x${Math.random().toString(16).substr(2, 64)}`;
    
    const sql = `
      INSERT INTO polyswap_orders (
        order_hash, owner, handler, sell_token, buy_token,
        sell_amount, min_buy_amount, start_time, end_time, polymarket_order_hash,
        app_data, block_number, transaction_hash, log_index, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT (order_hash) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP
      RETURNING order_hash
    `;

    // For now, use placeholder values for blockchain-specific fields
    // In production, these would come from the actual blockchain transaction
    const values = [
      orderHash,
      orderData.owner.toLowerCase(), // Use actual owner address from request
      '0x0000000000000000000000000000000000000000', // Placeholder handler address
      orderData.sellToken.toLowerCase(),
      orderData.buyToken.toLowerCase(),
      orderData.sellAmount,
      orderData.minBuyAmount,
      new Date(orderData.startDate), // startDate is now ISO string from backend
      new Date(orderData.deadline),  // Use the date string directly
      orderData.polymarketOrderHash,
      '0x0000000000000000000000000000000000000000000000000000000000000000', // Placeholder app_data
      0, // Placeholder block number
      '0x0000000000000000000000000000000000000000000000000000000000000000', // Placeholder transaction hash
      0,  // Placeholder log index
      'draft' // Default status for frontend-created orders
    ];

    try {
      const result = await query(sql, values);
      console.log(`✅ Successfully inserted frontend order ${orderHash}`);
      return orderHash;
    } catch (error) {
      console.error(`❌ Database error inserting frontend order ${orderHash}:`, error);
      throw error;
    }
  }

  /**
   * Insert a polyswap order from blockchain event
   */
  static async insertPolyswapOrder(order: PolyswapOrderRecord): Promise<void> {
    const sql = `
      INSERT INTO polyswap_orders (
        order_hash, owner, handler, sell_token, buy_token,
        sell_amount, min_buy_amount, start_time, end_time, polymarket_order_hash,
        app_data, block_number, transaction_hash, log_index, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT (order_hash) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP
    `;

    // Validate required numeric fields
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
      new Date(order.startTime * 1000), // Convert Unix timestamp to Date
      new Date(order.endTime * 1000),   // Convert Unix timestamp to Date
      order.polymarketOrderHash,
      order.appData,
      blockNumber,
      order.transactionHash,
      logIndex,
      'live' // Blockchain events indicate live orders
    ];

    try {
      await query(sql, values);
      console.log(`✅ Successfully inserted order ${order.orderHash}`);
    } catch (error) {
      console.error(`❌ Database error inserting order ${order.orderHash}:`, error);
      console.error('Order data:', {
        orderHash: order.orderHash,
        blockNumber,
        logIndex,
        transactionHash: order.transactionHash
      });
      throw error;
    }
  }

  /**
   * Get polyswap orders by owner address
   */
  static async getPolyswapOrdersByOwner(ownerAddress: string, limit: number = 100, offset: number = 0): Promise<DatabasePolyswapOrder[]> {
    let sql: string;
    let params: any[];
    
    if (ownerAddress && ownerAddress.trim() !== '') {
      sql = `
        SELECT * FROM polyswap_orders 
        WHERE owner = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3
      `;
      params = [ownerAddress.toLowerCase(), limit, offset];
    } else {
      // Get all orders if no owner specified
      sql = `
        SELECT * FROM polyswap_orders 
        ORDER BY created_at DESC 
        LIMIT $1 OFFSET $2
      `;
      params = [limit, offset];
    }
    
    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Get polyswap order by order hash
   */
  static async getPolyswapOrderByHash(orderHash: string): Promise<DatabasePolyswapOrder | null> {
    const sql = 'SELECT * FROM polyswap_orders WHERE order_hash = $1';
    const result = await query(sql, [orderHash]);
    return result.rows[0] || null;
  }

  /**
   * Get the latest processed block number for the listener
   */
  static async getLatestProcessedBlock(): Promise<number> {
    const sql = 'SELECT MAX(block_number) as latest_block FROM polyswap_orders';
    const result = await query(sql);
    return result.rows[0].latest_block || 0;
  }

  /**
   * Get polyswap orders by block range
   */
  static async getPolyswapOrdersByBlockRange(fromBlock: number, toBlock: number): Promise<DatabasePolyswapOrder[]> {
    const sql = `
      SELECT * FROM polyswap_orders 
      WHERE block_number >= $1 AND block_number <= $2 
      ORDER BY block_number ASC, log_index ASC
    `;
    const result = await query(sql, [fromBlock, toBlock]);
    return result.rows;
  }

  /**
   * Get polyswap orders by polymarket order hash
   */
  static async getPolyswapOrdersByPolymarketHash(polymarketHash: string): Promise<DatabasePolyswapOrder[]> {
    const sql = `
      SELECT * FROM polyswap_orders 
      WHERE polymarket_order_hash = $1 
      ORDER BY created_at DESC
    `;
    const result = await query(sql, [polymarketHash]);
    return result.rows;
  }

  /**
   * Update order status
   */
  static async updateOrderStatus(orderHash: string, status: 'draft' | 'live' | 'filled' | 'canceled'): Promise<boolean> {
    const sql = `
      UPDATE polyswap_orders 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE order_hash = $2
      RETURNING order_hash
    `;
    try {
      const result = await query(sql, [status, orderHash]);
      return result.rows.length > 0;
    } catch (error) {
      console.error(`❌ Error updating order status for ${orderHash}:`, error);
      return false;
    }
  }

  /**
   * Get orders by status
   */
  static async getOrdersByStatus(status: 'draft' | 'live' | 'filled' | 'canceled', limit: number = 100, offset: number = 0): Promise<DatabasePolyswapOrder[]> {
    const sql = `
      SELECT * FROM polyswap_orders 
      WHERE status = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    const result = await query(sql, [status, limit, offset]);
    return result.rows;
  }
}
