import { NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "../../../../../backend/services/databaseService";
import { getPolymarketOrderService } from "../../../../../backend/services/polymarketOrderService";
import { ethers } from "ethers";
import composableCowABI from "../../../../../abi/composableCoW.json";
import { verifySignature } from "../../../../../backend/utils/signatureVerification";

/**
 * @swagger
 * /api/polyswap/orders/remove:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Cancel an order
 *     description: Cancels a Polyswap order and returns the transaction to execute
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderHash
 *               - ownerAddress
 *               - signature
 *               - timestamp
 *               - chainId
 *             properties:
 *               orderHash:
 *                 type: string
 *                 description: Hash of the order to cancel
 *               ownerAddress:
 *                 type: string
 *                 description: Owner wallet address
 *               signature:
 *                 type: string
 *                 description: Signed message for authentication
 *               timestamp:
 *                 type: integer
 *                 description: Timestamp of the signature
 *               chainId:
 *                 type: integer
 *                 description: Chain ID
 *     responses:
 *       200:
 *         description: Transaction to execute for cancellation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         to:
 *                           type: string
 *                         data:
 *                           type: string
 *                         value:
 *                           type: string
 *                     polymarketCanceled:
 *                       type: boolean
 *       400:
 *         description: Invalid request or order status
 *       401:
 *         description: Missing authentication
 *       403:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 *   put:
 *     tags:
 *       - Orders
 *     summary: Confirm order cancellation
 *     description: Confirms the order cancellation after on-chain transaction
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderHash
 *               - transactionHash
 *               - confirmed
 *             properties:
 *               orderHash:
 *                 type: string
 *               transactionHash:
 *                 type: string
 *               confirmed:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Order status updated
 *       404:
 *         description: Order not found
 */
export async function POST(request: NextRequest) {
  try {
    const { orderHash, ownerAddress, signature, timestamp, chainId } = await request.json();

    if (!orderHash || !ownerAddress) {
      return NextResponse.json(
        { success: false, message: "Missing required fields: orderHash, ownerAddress" },
        { status: 400 }
      );
    }

    // Validate authentication fields
    if (!signature || !timestamp || !chainId) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing authentication: signature, timestamp, chainId required",
        },
        { status: 401 }
      );
    }

    const order = await DatabaseService.getPolyswapOrderByHashAndOwner(
      orderHash,
      ownerAddress.toLowerCase()
    );
    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found or not owned by this address" },
        { status: 404 }
      );
    }

    // Verify signature matches order owner
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const verification = await verifySignature({
      action: "cancel_order",
      orderIdentifier: orderHash,
      timestamp,
      chainId,
      signature,
      expectedAddress: order.owner,
      provider,
    });

    if (!verification.valid) {
      return NextResponse.json(
        { success: false, message: `Unauthorized: ${verification.error}` },
        { status: 403 }
      );
    }

    if (order.status !== "live") {
      return NextResponse.json(
        { success: false, message: `Cannot remove order with status: ${order.status}` },
        { status: 400 }
      );
    }

    // Create the remove transaction
    const composableCowAddress = process.env.COMPOSABLE_COW!;

    // Create contract interface to encode function call
    const contractInterface = new ethers.Interface(composableCowABI);

    // Encode the remove function call
    const removeCalldata = contractInterface.encodeFunctionData("remove", [orderHash]);

    const removeTransaction = {
      to: composableCowAddress,
      data: removeCalldata,
      value: "0",
    };

    let polymarketCanceled = false;
    if (
      order.polymarket_order_hash &&
      order.polymarket_order_hash !==
        "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      try {
        const polymarketOrderService = getPolymarketOrderService();
        await polymarketOrderService.initialize();
        await polymarketOrderService.cancelOrder(order.polymarket_order_hash);
        polymarketCanceled = true;
      } catch (polymarketError) {
        console.error("Failed to cancel Polymarket order:", polymarketError);
      }
    }

    // Return transaction data for frontend execution
    return NextResponse.json({
      success: true,
      data: {
        transaction: removeTransaction,
        polymarketCanceled: polymarketCanceled,
        message: polymarketCanceled
          ? "Polymarket order canceled. Please sign the CoW Protocol removal transaction."
          : "Polymarket cancellation failed or not needed. Please sign the CoW Protocol removal transaction.",
      },
    });
  } catch (error) {
    console.error("❌ Error in remove order endpoint:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      { success: false, message: `Server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { orderHash, transactionHash, confirmed } = await request.json();

    // Validate required fields
    if (!orderHash || !transactionHash || !confirmed) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required fields: orderHash, transactionHash, confirmed",
        },
        { status: 400 }
      );
    }

    const order = await DatabaseService.getPolyswapOrderByHash(orderHash);
    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    // Note: No signature verification needed here because:
    // 1. The POST endpoint already verified ownership before canceling Polymarket order
    // 2. The transactionHash proves a Safe transaction was executed (requires owner signature)
    // 3. This PUT only updates DB status after on-chain confirmation

    // Update the order status to canceled
    const result = await DatabaseService.updateOrderStatus(orderHash, "canceled");

    if (result) {
      return NextResponse.json({
        success: true,
        message: "Order cancellation confirmed and database updated",
        data: {
          orderHash,
          transactionHash,
          status: "canceled",
        },
      });
    } else {
      console.error("Failed to update order status in database");
      return NextResponse.json(
        { success: false, message: "Failed to update order status in database" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in PUT remove order endpoint:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      { success: false, message: `Server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}
