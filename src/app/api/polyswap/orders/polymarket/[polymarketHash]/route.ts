import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '../../../../../../backend/services/databaseService';

/**
 * @swagger
 * /api/polyswap/orders/polymarket/{polymarketHash}:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get orders by Polymarket hash
 *     description: Returns all orders linked to a Polymarket order hash
 *     parameters:
 *       - name: polymarketHash
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Polymarket order hash (0x + 64 hex chars)
 *     responses:
 *       200:
 *         description: Orders linked to the Polymarket hash
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *                 count:
 *                   type: integer
 *       400:
 *         description: Invalid Polymarket hash format
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ polymarketHash: string }> }
) {
  try {
    const { polymarketHash } = await params;

    // Validate polymarket hash format (should be 66 characters: 0x + 64 hex chars)
    if (!polymarketHash || !/^0x[a-fA-F0-9]{64}$/.test(polymarketHash)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid Polymarket hash',
        message: 'Please provide a valid Polymarket order hash (0x followed by 64 hex characters)'
      }, { status: 400 });
    }

    const orders = await DatabaseService.getPolyswapOrdersByPolymarketHash(polymarketHash);

    return NextResponse.json({
      success: true,
      data: orders,
      count: orders.length,
      message: `Found ${orders.length} orders linked to Polymarket hash ${polymarketHash}`
    });

  } catch (error) {
    console.error('Error fetching orders by Polymarket hash:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch orders',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 