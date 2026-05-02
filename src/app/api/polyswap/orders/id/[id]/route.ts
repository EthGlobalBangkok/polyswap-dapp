import { type NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { DatabaseService } from "../../../../../../backend/services/databaseService";
import { verifySignature } from "@/backend/utils/signatureVerification";
import { getPolymarketOrderService } from "@/backend/services/polymarketOrderService";

interface DeleteDraftBody {
  signature: string;
  timestamp: number;
}

function isDeleteBody(value: unknown): value is DeleteDraftBody {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.signature === "string" && typeof v.timestamp === "number";
}

/**
 * @swagger
 * /api/polyswap/orders/id/{id}:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get order by ID
 *     description: Returns a specific order by its numerical ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *         description: Order numerical ID
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
 *         description: Invalid order ID
 *       404:
 *         description: Order not found
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const orderId = parseInt(id, 10);
    if (isNaN(orderId) || orderId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid order ID",
          message: "Order ID must be a positive integer",
        },
        { status: 400 }
      );
    }

    const order = await DatabaseService.getPolyswapOrderById(orderId);
    if (!order) {
      return NextResponse.json(
        {
          success: false,
          error: "Order not found",
          message: `No order found with ID: ${orderId}`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: order,
      message: "Order retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching order by ID:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch order",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });
  }

  const body: unknown = await request.json();
  if (!isDeleteBody(body)) {
    return NextResponse.json(
      { success: false, error: "Body must include { signature: string, timestamp: number }" },
      { status: 400 }
    );
  }

  const order = await DatabaseService.getPolyswapOrderById(orderId);
  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "draft") {
    return NextResponse.json(
      {
        success: false,
        error:
          "Only drafts can be deleted off-chain. Live orders must be removed via ComposableCoW.remove(orderHash).",
      },
      { status: 400 }
    );
  }

  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    return NextResponse.json(
      { success: false, error: "Server RPC misconfigured" },
      { status: 500 }
    );
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const verification = await verifySignature({
    action: "cancel_draft",
    orderIdentifier: String(orderId),
    timestamp: body.timestamp,
    chainId: 137,
    signature: body.signature,
    expectedAddress: order.owner,
    provider,
  });
  if (!verification.valid) {
    return NextResponse.json(
      { success: false, error: verification.error ?? "Unauthorized" },
      { status: 401 }
    );
  }

  if (order.polymarket_order_hash) {
    try {
      const pm = getPolymarketOrderService();
      await pm.initialize();
      await pm.cancelOrder(order.polymarket_order_hash);
    } catch (err) {
      console.warn("Polymarket cancel failed during draft delete (idempotent):", err);
    }
  }

  await DatabaseService.deletePolyswapOrderById(orderId);
  return NextResponse.json({ success: true });
}
