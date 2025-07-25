import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';

const router = Router();

/**
 * GET /api/orders/:owner
 * Get polyswap orders for a specific owner address from blockchain events
 * Query parameters:
 * - limit: maximum number of results (default: 100, max: 500)
 * - offset: number of records to skip (default: 0)
 */
router.get('/orders/:owner', async (req: Request, res: Response) => {
  try {
    const { owner } = req.params;
    const { limit = '100', offset = '0' } = req.query;

    // Validate Ethereum address format
    if (!owner || !/^0x[a-fA-F0-9]{40}$/.test(owner)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid owner address',
        message: 'Please provide a valid Ethereum address (0x followed by 40 hex characters)'
      });
    }

    const limitNum = Math.min(parseInt(limit as string) || 100, 500);
    const offsetNum = Math.max(parseInt(offset as string) || 0, 0);

    const orders = await DatabaseService.getPolyswapOrdersByOwner(owner, limitNum, offsetNum);

    res.json({
      success: true,
      data: orders,
      count: orders.length,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: orders.length === limitNum
      },
      message: 'Orders retrieved successfully from blockchain events'
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/hash/:orderHash
 * Get a specific order by order hash
 */
router.get('/orders/hash/:orderHash', async (req: Request, res: Response) => {
  try {
    const { orderHash } = req.params;

    // Validate order hash format (should be 66 characters: 0x + 64 hex chars)
    if (!orderHash || !/^0x[a-fA-F0-9]{64}$/.test(orderHash)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order hash',
        message: 'Please provide a valid order hash (0x followed by 64 hex characters)'
      });
    }

    const order = await DatabaseService.getPolyswapOrderByHash(orderHash);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `No order found with hash: ${orderHash}`
      });
    }

    res.json({
      success: true,
      data: order,
      message: 'Order retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders
 * Get all polyswap orders with optional filtering
 * Query parameters:
 * - limit: maximum number of results (default: 100, max: 500)
 * - offset: number of records to skip (default: 0)
 * - fromBlock: filter orders from this block number
 * - toBlock: filter orders to this block number
 * - sellToken: filter by sell token address
 * - buyToken: filter by buy token address
 */
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const { 
      limit = '100', 
      offset = '0', 
      fromBlock,
      toBlock,
      sellToken,
      buyToken
    } = req.query;

    const limitNum = Math.min(parseInt(limit as string) || 100, 500);
    const offsetNum = Math.max(parseInt(offset as string) || 0, 0);

    let orders;

    if (fromBlock && toBlock) {
      const fromBlockNum = parseInt(fromBlock as string);
      const toBlockNum = parseInt(toBlock as string);
      
      if (isNaN(fromBlockNum) || isNaN(toBlockNum) || fromBlockNum > toBlockNum) {
        return res.status(400).json({
          success: false,
          error: 'Invalid block range',
          message: 'Please provide valid fromBlock and toBlock numbers'
        });
      }
      
      orders = await DatabaseService.getPolyswapOrdersByBlockRange(fromBlockNum, toBlockNum);
    } else {
      // For now, get all orders. In the future, we can add more filters
      orders = await DatabaseService.getPolyswapOrdersByOwner('', limitNum, offsetNum);
    }

    res.json({
      success: true,
      data: orders,
      count: orders.length,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: orders.length === limitNum
      },
      filters: {
        fromBlock: fromBlock ? parseInt(fromBlock as string) : undefined,
        toBlock: toBlock ? parseInt(toBlock as string) : undefined,
        sellToken,
        buyToken
      },
      message: 'Orders retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/polymarket/:polymarketHash
 * Get orders by Polymarket order hash
 */
router.get('/orders/polymarket/:polymarketHash', async (req: Request, res: Response) => {
  try {
    const { polymarketHash } = req.params;

    // Validate polymarket hash format (should be 66 characters: 0x + 64 hex chars)
    if (!polymarketHash || !/^0x[a-fA-F0-9]{64}$/.test(polymarketHash)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Polymarket hash',
        message: 'Please provide a valid Polymarket order hash (0x followed by 64 hex characters)'
      });
    }

    const orders = await DatabaseService.getPolyswapOrdersByPolymarketHash(polymarketHash);

    res.json({
      success: true,
      data: orders,
      count: orders.length,
      message: `Found ${orders.length} orders linked to Polymarket hash ${polymarketHash}`
    });

  } catch (error) {
    console.error('Error fetching orders by Polymarket hash:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;