import { type NextRequest, NextResponse } from "next/server";
import {
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddress,
  maxUint256,
  type Address,
  type Hex,
} from "viem";
import { DatabaseService } from "../../../../backend/services/databaseService";
import { TransactionEncodingService } from "../../../../backend/services/transactionEncodingService";
import { buildFallbackHandlerSetupTx } from "../../../../backend/services/safeFallbackHandlerService";
import { getPolymarketOrderService } from "../../../../backend/services/polymarketOrderService";
import { type PolyswapOrderData } from "../../../../backend/interfaces/PolyswapOrder";
import { getPostHogClient } from "../../../../lib/posthog-server";
import { createLogger } from "../../../../backend/logger";

const log = createLogger("api-orders");

const VAULT_RELAYER: Address = getAddress(
  process.env.VAULT_RELAYER ?? "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110"
);
const COMPOSABLE_COW: Address = getAddress(
  process.env.COMPOSABLE_COW ?? "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74"
);

const APP_DATA_DEFAULT: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";

interface CreateOrderRequestBody {
  sellToken: unknown;
  buyToken: unknown;
  sellAmount: unknown;
  minBuyAmount?: unknown;
  selectedOutcome: unknown;
  betPercentage: unknown;
  startDate?: unknown;
  deadline?: unknown;
  marketId: unknown;
  owner: unknown;
}

function parseBoundedInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number | null {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/**
 * @swagger
 * /api/polyswap/orders:
 *   get:
 *     tags:
 *       - Orders
 *     summary: Get all orders
 *     description: Returns all Polyswap orders with optional filters
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Number of orders to return (max 500)
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *       - name: fromBlock
 *         in: query
 *         schema:
 *           type: integer
 *         description: Filter orders from this block number
 *       - name: toBlock
 *         in: query
 *         schema:
 *           type: integer
 *         description: Filter orders up to this block number
 *       - name: sellToken
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by sell token address
 *       - name: buyToken
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by buy token address
 *     responses:
 *       200:
 *         description: List of orders
 *       400:
 *         description: Invalid block range
 *       500:
 *         description: Server error
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const limitNum = parseBoundedInt(searchParams.get("limit"), 100, 1, 500);
    if (limitNum === null) {
      return NextResponse.json(
        { success: false, error: "Invalid limit (must be an integer 1..500)" },
        { status: 400 }
      );
    }
    const offsetNum = parseBoundedInt(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
    if (offsetNum === null) {
      return NextResponse.json(
        { success: false, error: "Invalid offset (must be a non-negative integer)" },
        { status: 400 }
      );
    }

    const fromBlock = searchParams.get("fromBlock");
    const toBlock = searchParams.get("toBlock");
    const ownerRaw = searchParams.get("owner");

    if (ownerRaw !== null && !isAddress(ownerRaw)) {
      return NextResponse.json({ success: false, error: "Invalid owner address" }, { status: 400 });
    }

    let orders;

    if (fromBlock !== null || toBlock !== null) {
      if (fromBlock === null || toBlock === null) {
        return NextResponse.json(
          { success: false, error: "fromBlock and toBlock must be provided together" },
          { status: 400 }
        );
      }
      const fromBlockNum = Number(fromBlock);
      const toBlockNum = Number(toBlock);

      if (
        !Number.isInteger(fromBlockNum) ||
        !Number.isInteger(toBlockNum) ||
        fromBlockNum < 0 ||
        toBlockNum < 0 ||
        fromBlockNum > toBlockNum
      ) {
        return NextResponse.json({ success: false, error: "Invalid block range" }, { status: 400 });
      }

      orders = await DatabaseService.getPolyswapOrdersByBlockRange(fromBlockNum, toBlockNum);
    } else {
      orders = await DatabaseService.getPolyswapOrdersByOwner(ownerRaw ?? "", limitNum, offsetNum);
    }

    return NextResponse.json({
      success: true,
      data: orders,
      count: orders.length,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: orders.length === limitNum,
      },
      filters: {
        owner: ownerRaw,
        fromBlock: fromBlock !== null ? Number(fromBlock) : undefined,
        toBlock: toBlock !== null ? Number(toBlock) : undefined,
      },
      message: "Orders retrieved successfully",
    });
  } catch (error) {
    log.error("error fetching orders:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch orders",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/polyswap/orders:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Create a new order (consolidated)
 *     description: >
 *       Creates a draft DB row, places the Polymarket GTD order, builds
 *       ComposableCoW calldata, and returns both a single-tx and an
 *       approve+create batch — all in one round-trip.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sellToken
 *               - buyToken
 *               - sellAmount
 *               - selectedOutcome
 *               - betPercentage
 *               - marketId
 *               - owner
 *     responses:
 *       200:
 *         description: Order bundle created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Market not found
 *       502:
 *         description: Polymarket placement failed
 *       500:
 *         description: Server error
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateOrderRequestBody;

    const requiredFields = [
      "sellToken",
      "buyToken",
      "sellAmount",
      "selectedOutcome",
      "betPercentage",
      "marketId",
      "owner",
    ] as const;

    const missing = requiredFields.filter(
      (f) => body[f] === undefined || body[f] === null || body[f] === ""
    );
    if (missing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Narrow typed fields
    const sellTokenRaw = body.sellToken;
    const buyTokenRaw = body.buyToken;
    const ownerRaw = body.owner;

    if (typeof sellTokenRaw !== "string" || !isAddress(sellTokenRaw)) {
      return NextResponse.json(
        { success: false, error: "Invalid sellToken address" },
        { status: 400 }
      );
    }
    if (typeof buyTokenRaw !== "string" || !isAddress(buyTokenRaw)) {
      return NextResponse.json(
        { success: false, error: "Invalid buyToken address" },
        { status: 400 }
      );
    }
    if (typeof ownerRaw !== "string" || !isAddress(ownerRaw)) {
      return NextResponse.json({ success: false, error: "Invalid owner address" }, { status: 400 });
    }

    // isAddress is a type guard — these are now Address
    const sellToken: Address = sellTokenRaw;
    const buyToken: Address = buyTokenRaw;
    const owner: Address = ownerRaw;

    if (typeof body.sellAmount !== "string" || parseFloat(body.sellAmount) <= 0) {
      return NextResponse.json(
        { success: false, error: "sellAmount must be a positive number string" },
        { status: 400 }
      );
    }
    const sellAmount: string = body.sellAmount;

    const minBuyAmount: string =
      typeof body.minBuyAmount === "string" && body.minBuyAmount !== "" ? body.minBuyAmount : "1";
    if (parseFloat(minBuyAmount) <= 0) {
      return NextResponse.json(
        { success: false, error: "minBuyAmount must be positive" },
        { status: 400 }
      );
    }

    if (typeof body.selectedOutcome !== "string" || body.selectedOutcome === "") {
      return NextResponse.json(
        { success: false, error: "selectedOutcome must be a non-empty string" },
        { status: 400 }
      );
    }
    const selectedOutcome: string = body.selectedOutcome;

    const betPercentage = Number(body.betPercentage);
    if (!isFinite(betPercentage) || betPercentage <= 0 || betPercentage > 100) {
      return NextResponse.json(
        { success: false, error: "betPercentage must be a finite number in (0, 100]" },
        { status: 400 }
      );
    }

    if (typeof body.marketId !== "string" || body.marketId === "") {
      return NextResponse.json(
        { success: false, error: "marketId must be a non-empty string" },
        { status: 400 }
      );
    }
    const marketId: string = body.marketId;

    if (body.startDate !== undefined && typeof body.startDate !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid startDate", message: "startDate must be a string" },
        { status: 400 }
      );
    }
    if (body.deadline !== undefined && typeof body.deadline !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid deadline", message: "deadline must be a string" },
        { status: 400 }
      );
    }

    const now = new Date();
    let startDate: Date;
    if (!body.startDate || body.startDate === "now") {
      startDate = new Date();
    } else {
      startDate = new Date(body.startDate);
      // Reject start dates more than 60s in the past
      if (startDate < new Date(now.getTime() - 60_000)) {
        return NextResponse.json(
          { success: false, error: "startDate must not be in the past" },
          { status: 400 }
        );
      }
    }

    let deadline: Date;
    if (!body.deadline) {
      deadline = new Date(startDate);
      deadline.setDate(deadline.getDate() + 14);
    } else {
      deadline = new Date(body.deadline);
    }

    if (deadline <= startDate) {
      return NextResponse.json(
        { success: false, error: "deadline must be after startDate" },
        { status: 400 }
      );
    }

    const market = await DatabaseService.getMarketById(marketId);
    if (!market) {
      return NextResponse.json(
        { success: false, error: "Market not found", message: `No market with id: ${marketId}` },
        { status: 404 }
      );
    }

    const clobTokenIds: string[] = market.clob_token_ids ?? [];
    if (clobTokenIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Market has no CLOB token IDs" },
        { status: 400 }
      );
    }

    const outcomes: string[] = Array.isArray(market.outcomes) ? market.outcomes : [];
    if (outcomes.length === 0) {
      return NextResponse.json(
        { success: false, error: "Market has no outcomes recorded" },
        { status: 500 }
      );
    }

    const outcomeIndex = outcomes.indexOf(selectedOutcome);
    if (outcomeIndex === -1) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid outcome",
          message: `'${selectedOutcome}' is not valid. Valid outcomes: ${outcomes.join(", ")}`,
        },
        { status: 400 }
      );
    }
    if (outcomeIndex >= clobTokenIds.length) {
      return NextResponse.json(
        { success: false, error: "No CLOB token ID for the selected outcome" },
        { status: 500 }
      );
    }

    let polymarketOrderHash: string;
    try {
      const polymarket = getPolymarketOrderService();
      await polymarket.initialize();
      const tokenID = clobTokenIds[outcomeIndex]!;
      const price = betPercentage / 100;
      const expiration = Math.floor(deadline.getTime() / 1000);
      log.info(
        `placing GTD order: market=${marketId} outcome=${selectedOutcome} ` +
          `tokenID=${tokenID} price=${price} expiration=${expiration}`
      );
      const result = await polymarket.postGTDOrder({
        tokenID,
        price,
        side: "BUY",
        size: 5,
        expiration,
      });
      polymarketOrderHash = result.response.orderID;
      log.info(`GTD order accepted: orderID=${polymarketOrderHash}`);
    } catch (polymarketError) {
      log.error("GTD order placement failed:", polymarketError);
      return NextResponse.json(
        { success: false, error: "Polymarket order placement error" },
        { status: 502 }
      );
    }

    const orderData: PolyswapOrderData = {
      sellToken,
      buyToken,
      receiver: owner,
      sellAmount,
      minBuyAmount,
      t0: Math.floor(startDate.getTime() / 1000).toString(),
      t: Math.floor(deadline.getTime() / 1000).toString(),
      polymarketOrderHash,
      appData: APP_DATA_DEFAULT,
    };

    const params = TransactionEncodingService.createConditionalOrderParams(orderData);
    const createCalldata = TransactionEncodingService.encodeCreateWithContextCallData(params);
    const orderHash = TransactionEncodingService.calculateOrderHash(params);
    const approveCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [VAULT_RELAYER, maxUint256],
    });

    let orderId: number;
    try {
      orderId = await DatabaseService.insertPolyswapOrderFromForm({
        sellToken,
        buyToken,
        sellAmount,
        minBuyAmount,
        startDate: startDate.toISOString(),
        deadline: deadline.toISOString(),
        marketId,
        owner,
        outcomeSelected: selectedOutcome,
        betPercentageValue: betPercentage,
        polymarketOrderHash,
        salt: params.salt,
      });
    } catch (dbError) {
      log.error("failed to insert order into database:", dbError);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to save order",
          message: dbError instanceof Error ? dbError.message : "Unknown DB error",
        },
        { status: 500 }
      );
    }

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: owner,
      event: "server_order_created",
      properties: {
        order_id: orderId,
        market_id: marketId,
        sell_token: sellToken,
        buy_token: buyToken,
        selected_outcome: selectedOutcome,
        bet_percentage: betPercentage,
        owner,
      },
    });

    // --- Detect fresh Safes that haven't installed CoW's ExtensibleFallbackHandler
    // yet. The setup self-call is returned alongside the order bundle so the
    // frontend can prepend it to whichever path it submits (single create vs.
    // approve+create). Failures here are non-fatal — we just skip the prepend.
    const fallbackSetupTx = await buildFallbackHandlerSetupTx(owner as Address);

    return NextResponse.json({
      success: true,
      data: {
        orderId,
        polymarketOrderHash,
        orderHash,
        tx: { to: COMPOSABLE_COW, data: createCalldata, value: "0" },
        batchTx: [
          { to: sellToken, data: approveCalldata, value: "0" },
          { to: COMPOSABLE_COW, data: createCalldata, value: "0" },
        ],
        fallbackSetupTx,
        sellToken,
        sellAmount,
        vaultRelayer: VAULT_RELAYER,
      },
    });
  } catch (error) {
    log.error("error creating order:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create order",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
