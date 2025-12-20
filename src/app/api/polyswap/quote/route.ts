import { NextRequest, NextResponse } from "next/server";
import { CowQuoteService } from "@/backend/services/cowQuoteService";
import { TokenPriceService } from "@/backend/services/tokenPriceService";

/**
 * @swagger
 * /api/polyswap/quote:
 *   post:
 *     tags:
 *       - Quote
 *     summary: Get swap quote
 *     description: Get a quote for swapping tokens via CoW Protocol
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
 *               - userAddress
 *             properties:
 *               sellToken:
 *                 type: string
 *                 description: Token address to sell
 *               buyToken:
 *                 type: string
 *                 description: Token address to buy
 *               sellAmount:
 *                 type: string
 *                 description: Amount to sell in wei
 *               userAddress:
 *                 type: string
 *                 description: User wallet address
 *               chainId:
 *                 type: integer
 *                 default: 137
 *                 description: Chain ID (default Polygon)
 *     responses:
 *       200:
 *         description: Quote details
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
 *                     buyAmount:
 *                       type: string
 *                     sellAmount:
 *                       type: string
 *                     feeAmount:
 *                       type: string
 *                     validTo:
 *                       type: integer
 *                     exchangeRate:
 *                       type: number
 *                     buyAmountFormatted:
 *                       type: string
 *                     sellAmountFormatted:
 *                       type: string
 *                     sellTokenUsdPrice:
 *                       type: number
 *                     buyTokenUsdPrice:
 *                       type: number
 *       400:
 *         description: Invalid request or no route found
 *       502:
 *         description: CoW API error
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { sellToken, buyToken, sellAmount, userAddress, chainId } = body;

    // Validate required fields
    if (!sellToken || !buyToken || !sellAmount || !userAddress) {
      return NextResponse.json(
        {
          success: false,
          error: "missing_fields",
          message: "Missing required fields: sellToken, buyToken, sellAmount, userAddress",
        },
        { status: 400 }
      );
    }

    // Default to Polygon if chainId not provided
    const networkChainId = chainId || 137;

    // Validate sellAmount is a valid number
    if (isNaN(Number(sellAmount)) || Number(sellAmount) <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "invalid_amount",
          message: "Sell amount must be a valid positive number",
        },
        { status: 400 }
      );
    }

    // Get quote from CoW Protocol and token prices in parallel
    const [quote, sellTokenPrice, buyTokenPrice] = await Promise.all([
      CowQuoteService.getCowSwapQuote({
        sellToken,
        buyToken,
        sellAmount,
        userAddress,
        chainId: networkChainId,
      }),
      TokenPriceService.getTokenUsdPrice(sellToken, networkChainId),
      TokenPriceService.getTokenUsdPrice(buyToken, networkChainId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        buyAmount: quote.buyAmount,
        sellAmount: quote.sellAmount,
        feeAmount: quote.feeAmount,
        validTo: quote.validTo,
        exchangeRate: quote.exchangeRate,
        buyAmountFormatted: quote.buyAmountFormatted,
        sellAmountFormatted: quote.sellAmountFormatted,
        sellTokenUsdPrice: sellTokenPrice,
        buyTokenUsdPrice: buyTokenPrice,
      },
    });
  } catch (error) {
    console.error("Error in quote API:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Check for specific error types
    if (errorMessage.includes("Unsupported chain")) {
      return NextResponse.json(
        {
          success: false,
          error: "unsupported_chain",
          message: errorMessage,
        },
        { status: 400 }
      );
    }

    if (errorMessage.includes("no route found")) {
      return NextResponse.json(
        {
          success: false,
          error: "no_route_found",
          message: "No route found",
        },
        { status: 400 }
      );
    }

    if (errorMessage.includes("Invalid") && errorMessage.includes("address")) {
      return NextResponse.json(
        {
          success: false,
          error: "invalid_address",
          message: errorMessage,
        },
        { status: 400 }
      );
    }

    if (errorMessage.includes("CoW API error")) {
      return NextResponse.json(
        {
          success: false,
          error: "cow_api_error",
          message: errorMessage,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "quote_failed",
        message: `Failed to get quote: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
