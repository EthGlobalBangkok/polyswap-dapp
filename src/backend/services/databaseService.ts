import { query } from '../db/database';
import { Market } from '../interfaces/Market';
import { DatabaseMarket } from '../interfaces/Database';
import { PolyswapOrderRecord, DatabasePolyswapOrder } from '../interfaces/PolyswapOrder';

export class DatabaseService {
  
  /**
   * Insert a new market into the database with only essential fields
   */
  static async insertMarket(market: Market): Promise<void> {
    const sql = `
      INSERT INTO markets (
        id, question, condition_id, start_date, end_date, volume, outcomes, outcome_prices
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      )
      ON CONFLICT (condition_id) DO UPDATE SET
        question = EXCLUDED.question,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        volume = EXCLUDED.volume,
        outcomes = EXCLUDED.outcomes,
        outcome_prices = EXCLUDED.outcome_prices,
        updated_at = CURRENT_TIMESTAMP
    `;

    // Parse and prepare JSON data
    const outcomesData = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes;
    const pricesData = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : market.outcomePrices;
    
    const values = [
      market.id,
      market.question,
      market.conditionId,
      new Date(market.startDate),
      new Date(market.endDate),
      parseFloat(market.volume) || 0,
      JSON.stringify(outcomesData), // Convert back to string for PostgreSQL
      JSON.stringify(pricesData)    // Convert back to string for PostgreSQL
    ];

    await query(sql, values);
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
   * Get markets by volume threshold with pagination
   */
  static async getMarketsByVolume(minVolume: number, limit: number = 50, offset: number = 0): Promise<DatabaseMarket[]> {
    const sql = 'SELECT * FROM markets WHERE volume >= $1 ORDER BY volume DESC LIMIT $2 OFFSET $3';
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
   * Search markets by multiple keywords (all keywords must be present)
   */
    static async searchMarketsByKeywords(keywords: string[], limit: number = 100): Promise<DatabaseMarket[]> {
        if (keywords.length === 0) {
            return [];
        }
        
        // Build dynamic SQL with multiple LIKE conditions
        const conditions = keywords.map((_, index) => `LOWER(question) LIKE LOWER($${index + 1})`);
        const sql = `SELECT * FROM markets WHERE ${conditions.join(' AND ')} ORDER BY volume DESC LIMIT $${keywords.length + 1}`;
        
        // Create search patterns for each keyword
        const searchPatterns = keywords.map(keyword => `%${keyword.trim()}%`);
        
        const result = await query(sql, [...searchPatterns, limit]);
        return result.rows;
    }

  /**
   * Search markets by any of the provided keywords (OR search)
   */
    static async searchMarketsByAnyKeyword(keywords: string[], limit: number = 100): Promise<DatabaseMarket[]> {
        if (keywords.length === 0) {
            return [];
        }
        
        // Build dynamic SQL with multiple LIKE conditions using OR
        const conditions = keywords.map((_, index) => `LOWER(question) LIKE LOWER($${index + 1})`);
        const sql = `SELECT * FROM markets WHERE ${conditions.join(' OR ')} ORDER BY volume DESC LIMIT $${keywords.length + 1}`;
        
        // Create search patterns for each keyword
        const searchPatterns = keywords.map(keyword => `%${keyword.trim()}%`);
        
        const result = await query(sql, [...searchPatterns, limit]);
        return result.rows;
    }

  /**
   * Get markets ending after a specific date with pagination
   */
  static async getMarketsEndingAfter(date: Date, limit: number = 100, offset: number = 0): Promise<DatabaseMarket[]> {
    const sql = 'SELECT * FROM markets WHERE end_date > $1 ORDER BY end_date ASC LIMIT $2 OFFSET $3';
    const result = await query(sql, [date, limit, offset]);
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
   * Bulk insert markets
   */
  static async insertMarkets(markets: Market[]): Promise<void> {
    console.log(`Inserting ${markets.length} markets into database...`);
    
    for (const market of markets) {
      try {
        await this.insertMarket(market);
      } catch (error) {
        console.error(`Error inserting market ${market.id}:`, error);
        // Continue with other markets
      }
    }
    
    console.log(`Finished inserting markets`);
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
   * Insert a polyswap order from blockchain event
   */
  static async insertPolyswapOrder(order: PolyswapOrderRecord): Promise<void> {
    const sql = `
      INSERT INTO polyswap_orders (
        order_hash, owner, handler, sell_token, buy_token,
        sell_amount, min_buy_amount, start_time, end_time, polymarket_order_hash,
        app_data, block_number, transaction_hash, log_index
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
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
      logIndex
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
}
