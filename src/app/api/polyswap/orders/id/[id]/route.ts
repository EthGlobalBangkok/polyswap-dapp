import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '../../../../../../backend/services/databaseService';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const orderId = parseInt(id, 10);
    if (isNaN(orderId) || orderId <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid order ID',
        message: 'Order ID must be a positive integer'
      }, { status: 400 });
    }

    const order = await DatabaseService.getPolyswapOrderById(orderId);
    if (!order) {
      return NextResponse.json({
        success: false,
        error: 'Order not found',
        message: `No order found with ID: ${orderId}`
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: order,
      message: 'Order retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching order by ID:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch order',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
