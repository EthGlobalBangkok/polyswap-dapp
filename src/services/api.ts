// API service for communicating with the backend.
// Market-related methods (getTopMarkets, searchMarkets, getMarketById,
// getMarketBySlug, getMarketsByCategory) were removed in Phase 3 —
// they are now handled by useMarketsData.ts + the Polymarket Gamma client.
import { type DatabasePolyswapOrder } from "../backend/interfaces/PolyswapOrder";

class ApiService {
  private baseUrl = "/api"; // Use relative paths for Next.js API routes

  private async fetchApi(
    endpoint: string,
    params?: Record<string, string | number>
  ): Promise<unknown> {
    const fullPath = `${this.baseUrl}${endpoint}`;
    const url = new URL(fullPath, window.location.origin);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  // ---------------------------------------------------------------------------
  // PolySwap Order flow
  // ---------------------------------------------------------------------------

  async createPolyswapOrder(orderData: {
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    minBuyAmount: string;
    selectedOutcome: string;
    betPercentage: string;
    startDate: string;
    deadline: string;
    marketId: string;
    marketTitle?: string;
    marketDescription?: string;
    clobTokenId?: string;
    owner: string;
  }): Promise<{
    success: boolean;
    data?: unknown;
    message?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/polyswap/orders/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });
      return response.json() as Promise<{
        success: boolean;
        data?: unknown;
        message?: string;
        error?: string;
      }>;
    } catch (error) {
      console.error("Failed to create polyswap order:", error);
      return {
        success: false,
        error: "Failed to create order",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async createPolymarketOrder(orderHash: string): Promise<{
    success: boolean;
    data?: { polymarketOrderHash: string };
    message?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/polyswap/orders/polymarket`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderHash }),
      });
      return response.json() as Promise<{
        success: boolean;
        data?: { polymarketOrderHash: string };
        message?: string;
        error?: string;
      }>;
    } catch (error) {
      console.error("Failed to create polymarket order:", error);
      return {
        success: false,
        error: "Failed to create polymarket order",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getTransactionDataById(orderId: number): Promise<{
    success: boolean;
    data?: { transaction: unknown; orderId: number; polymarketOrderHash: string };
    message?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/polyswap/orders/id/${orderId}/transaction`);
      return response.json() as Promise<{
        success: boolean;
        data?: { transaction: unknown; orderId: number; polymarketOrderHash: string };
        message?: string;
        error?: string;
      }>;
    } catch (error) {
      console.error("Failed to fetch transaction data:", error);
      return {
        success: false,
        error: "Failed to fetch transaction data",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async updateOrderTransactionHashById(
    orderId: number,
    transactionHash: string
  ): Promise<{
    success: boolean;
    data?: unknown;
    message?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/polyswap/orders/id/${orderId}/transaction`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionHash }),
      });
      return response.json() as Promise<{
        success: boolean;
        data?: unknown;
        message?: string;
        error?: string;
      }>;
    } catch (error) {
      console.error("Failed to update transaction hash:", error);
      return {
        success: false,
        error: "Failed to update transaction hash",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getOrdersByOwner(
    ownerAddress: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<{
    success: boolean;
    data?: DatabasePolyswapOrder[];
    count?: number;
    pagination?: { limit: number; offset: number; hasMore: boolean };
    message?: string;
    error?: string;
  }> {
    try {
      const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
      const response = await fetch(`${this.baseUrl}/polyswap/orders/${ownerAddress}?${params}`);
      return response.json() as Promise<{
        success: boolean;
        data?: DatabasePolyswapOrder[];
        count?: number;
        pagination?: { limit: number; offset: number; hasMore: boolean };
        message?: string;
        error?: string;
      }>;
    } catch (error) {
      console.error("Failed to fetch orders by owner:", error);
      return {
        success: false,
        error: "Failed to fetch orders",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

export const apiService = new ApiService();
