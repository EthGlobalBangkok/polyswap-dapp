import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '../../../../../../backend/services/databaseService';

/**
 * @swagger
 * /api/polyswap/orders/hash/{orderHash}:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get order by hash
 *     description: Returns a specific order by its order hash
 *     parameters:
 *       - name: orderHash
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Order hash (0x + 64 hex chars)
 *     responses:
 *       200:
 *         description: Order details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Invalid order hash format
 *       404:
 *         description: Order not found
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderHash: string }> }
) {
  try {
    const { orderHash } = await params;

    // Validate order hash format (should be 66 characters: 0x + 64 hex chars)
    if (!orderHash || !/^0x[a-fA-F0-9]{64}$/.test(orderHash)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid order hash',
        message: 'Please provide a valid order hash (0x followed by 64 hex characters)'
      }, { status: 400 });
    }

    const order = await DatabaseService.getPolyswapOrderByHash(orderHash);

    if (!order) {
      return NextResponse.json({
        success: false,
        error: 'Order not found',
        message: `No order found with hash: ${orderHash}`
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: order,
      message: 'Order retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch order',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 