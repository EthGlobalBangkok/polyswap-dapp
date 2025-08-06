import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
import { PolymarketAPIService } from '../services/polymarketAPIService';

const router = Router();

/**
 * GET /api/markets/top
 * Get top 50 markets by volume
 */
router.get('/top', async (req: Request, res: Response) => {
  try {
    const markets = await DatabaseService.getMarketsByVolume(0, 50);
    
    res.json({
      success: true,
      data: markets,
      count: markets.length,
      message: 'Top markets retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching top markets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top markets',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/markets/search?q=keyword1,keyword2&type=all|any&category=Politics&limit=100&offset=0
 * Search markets by keywords and optionally by category
 * Query parameters:
 * - q: comma-separated keywords (optional if category is provided)
 * - type: 'all' (AND search) or 'any' (OR search), default: 'any'
 * - category: filter by category (Politics, Crypto, Economics, Sports, Entertainment, World, Technology, Other)
 * - limit: maximum number of results, default: 100
 * - offset: number of records to skip, default: 0
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, type = 'any', category, limit = '100', offset = '0'} = req.query;
    
    // Allow category-only search (no query required)
    if (!q && !category) {
      return res.status(400).json({
        success: false,
        error: 'Missing search parameters',
        message: 'Please provide either a search query (q) or a category'
      });
    }
    
    const keywords = q && typeof q === 'string' ? q.split(',').map((keyword: string) => keyword.trim()).filter(Boolean) : [];
    const maxResults = Math.min(parseInt(limit as string) || 100, 500); // Cap at 500
    const offsetNum = Math.max(parseInt(offset as string) || 0, 0);
    
    let markets;
    
    if (category && typeof category === 'string') {
      if (keywords.length === 0) {
        // Category-only search
        markets = await DatabaseService.getMarketsByCategory(category, maxResults, offsetNum);
      } else {
        // Search by keywords AND category
        if (type === 'all') {
          markets = await DatabaseService.searchMarketsByKeywordsAndCategory(keywords, category, maxResults, offsetNum);
        } else {
          markets = await DatabaseService.searchMarketsByAnyKeywordAndCategory(keywords, category, maxResults, offsetNum);
        }
      }
    } else {
      // Search by keywords only
      if (keywords.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid keywords provided',
          message: 'Please provide at least one keyword'
        });
      }
      
      if (type === 'all') {
        markets = await DatabaseService.searchMarketsByKeywords(keywords, maxResults, offsetNum);
      } else {
        markets = await DatabaseService.searchMarketsByAnyKeyword(keywords, maxResults, offsetNum);
      }
    }
    
    res.json({
      success: true,
      data: markets,
      count: markets.length,
      searchType: type,
      keywords: keywords,
      category: category || null,
      pagination: {
        limit: maxResults,
        offset: offsetNum,
        hasMore: markets.length === maxResults
      },
      message: `Found ${markets.length} markets`
    });
  } catch (error) {
    console.error('Error searching markets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search markets',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/markets/category/:category
 * Get markets by category
 * Query parameters:
 * - limit: maximum number of results, default: 100
 * - offset: number of records to skip, default: 0
 */
router.get('/category/:category', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const { limit = '100', offset = '0' } = req.query;
    
    if (!category) {
      return res.status(400).json({
        success: false,
        error: 'Missing category parameter',
        message: 'Please provide a category'
      });
    }
    
    const limitNum = Math.min(parseInt(limit as string) || 100, 500);
    const offsetNum = Math.max(parseInt(offset as string) || 0, 0);
    
    const markets = await DatabaseService.getMarketsByCategory(category, limitNum, offsetNum);
    
    res.json({
      success: true,
      data: markets,
      count: markets.length,
      category: category,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: markets.length === limitNum
      },
      message: `Found ${markets.length} markets in ${category} category`
    });
  } catch (error) {
    console.error('Error fetching markets by category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch markets by category',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/markets/:identifier
 * Get market details by ID or condition ID
 * The identifier can be either the market ID or condition ID
 */
router.get('/:identifier', async (req: Request, res: Response) => {
  try {
    const { identifier } = req.params;
    
    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'Missing identifier',
        message: 'Please provide a market ID or condition ID'
      });
    }
    
    let market;
    
    // Try to find by condition ID first (longer hex string starting with 0x)
    if (identifier.startsWith('0x') && identifier.length == 66) {
      market = await PolymarketAPIService.getMarketByConditionId(identifier);
    } else {
      // Try to find by market ID
      market = await PolymarketAPIService.getMarketById(identifier);
    }

    // save market to database if not found or update if it exists
    if (market) {
        DatabaseService.insertMarket(market);
    }
    
    if (!market) {
      return res.status(404).json({
        success: false,
        error: 'Market not found',
        message: `No market found with identifier: ${identifier}`
      });
    }
    
    res.json({
      success: true,
      data: market,
      message: 'Market retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching market:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch market',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/markets
 * Get all markets with optional filtering
 * Query parameters:
 * - limit: maximum number of results (default: 100, max: 500)
 * - offset: number of records to skip (default: 0)
 * - minVolume: minimum volume filter
 * - endAfter: ISO date string - only markets ending after this date
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { 
      limit = '100', 
      offset = '0', 
      minVolume,
      endAfter 
    } = req.query;
    
    const limitNum = Math.min(parseInt(limit as string) || 100, 500);
    const offsetNum = Math.max(parseInt(offset as string) || 0, 0);
    
    let markets;
    
    if (minVolume) {
      const minVol = parseFloat(minVolume as string);
      markets = await DatabaseService.getMarketsByVolume(minVol, limitNum, offsetNum);
    } else if (endAfter) {
      const endDate = new Date(endAfter as string);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format',
          message: 'Please provide a valid ISO date string for endAfter parameter'
        });
      }
      markets = await DatabaseService.getMarketsEndingAfter(endDate, limitNum, offsetNum);
    } else {
      markets = await DatabaseService.getAllMarkets(limitNum, offsetNum);
    }
    
    res.json({
      success: true,
      data: markets,
      count: markets.length,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: markets.length === limitNum
      },
      message: 'Markets retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching markets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch markets',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;