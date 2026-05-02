import { type NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, getAddress, type Address, type Hex } from "viem";
import { polygon } from "viem/chains";
import { ethers } from "ethers";
import composableCowAbi from "@/abi/composableCoW.json";
import { DatabaseService } from "@/backend/services/databaseService";
import { verifySignature } from "@/backend/utils/signatureVerification";
import { getPolymarketOrderService } from "@/backend/services/polymarketOrderService";

const COMPOSABLE_COW: Address = getAddress(
  process.env.COMPOSABLE_COW ?? "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74"
);

interface NotifyRemoveBody {
  signature: string;
  timestamp: number;
}

function isNotifyBody(value: unknown): value is NotifyRemoveBody {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.signature === "string" && typeof v.timestamp === "number";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });
  }

  const body: unknown = await request.json();
  if (!isNotifyBody(body)) {
    return NextResponse.json(
      { success: false, error: "Body must include { signature: string, timestamp: number }" },
      { status: 400 }
    );
  }

  const order = await DatabaseService.getPolyswapOrderById(orderId);
  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "live") {
    return NextResponse.json(
      { success: false, error: "Only live orders can be notified for removal" },
      { status: 400 }
    );
  }
  if (!order.order_hash) {
    return NextResponse.json(
      { success: false, error: "Order has no on-chain hash yet; cannot verify removal" },
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
    action: "notify_remove",
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

  // ComposableCoW.remove() emits no event, and Safe-wrapped txs hide the inner call,
  // so we verify removal by reading singleOrders[owner][orderHash] (true after create, false after remove).
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(rpcUrl),
  });

  const isStillActive = await publicClient.readContract({
    address: COMPOSABLE_COW,
    abi: composableCowAbi,
    functionName: "singleOrders",
    args: [getAddress(order.owner), order.order_hash as Hex],
  });

  if (isStillActive === true) {
    return NextResponse.json(
      { success: false, error: "Order is still active on-chain. Send remove() first." },
      { status: 400 }
    );
  }
  if (isStillActive !== false) {
    return NextResponse.json(
      { success: false, error: "Unexpected on-chain state for order" },
      { status: 502 }
    );
  }

  if (order.polymarket_order_hash) {
    try {
      const pm = getPolymarketOrderService();
      await pm.initialize();
      await pm.cancelOrder(order.polymarket_order_hash);
    } catch (err) {
      console.warn("Polymarket cancel failed during notify-remove (idempotent):", err);
    }
  }

  await DatabaseService.updateOrderStatusById(orderId, "canceled");
  return NextResponse.json({ success: true });
}
