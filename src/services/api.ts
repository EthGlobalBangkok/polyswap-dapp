// API service for communicating with the backend.
// Market-related methods (getTopMarkets, searchMarkets, getMarketById,
// getMarketBySlug, getMarketsByCategory) were removed in Phase 3 —
// they are now handled by useMarketsData.ts + the Polymarket Gamma client.
import type { Address, Hex } from "viem";
import { type DatabasePolyswapOrder } from "../backend/interfaces/PolyswapOrder";

// ---------------------------------------------------------------------------
// PolySwap Order types (consolidated POST /polyswap/orders)
// ---------------------------------------------------------------------------

export interface CreatePolyswapOrderRequest {
  sellToken: Address;
  buyToken: Address;
  sellAmount: string;
  minBuyAmount?: string;
  selectedOutcome: string;
  betPercentage: number;
  startDate?: string;
  deadline?: string;
  marketId: string;
  owner: Address;
}

export interface PolyswapTxCall {
  to: Address;
  data: Hex;
  value: string;
}

export interface CreatePolyswapOrderResponse {
  orderId: number;
  polymarketOrderHash: string;
  orderHash: string;
  tx: PolyswapTxCall;
  batchTx: PolyswapTxCall[];
  sellToken: Address;
  sellAmount: string;
  vaultRelayer: Address;
}

interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPolyswapTxCall(value: unknown): value is PolyswapTxCall {
  return (
    isRecord(value) &&
    typeof value.to === "string" &&
    typeof value.data === "string" &&
    typeof value.value === "string"
  );
}

function isCreateOrderSuccess(
  json: unknown
): json is ApiSuccessEnvelope<CreatePolyswapOrderResponse> {
  if (!isRecord(json)) return false;
  if (json.success !== true) return false;
  if (!isRecord(json.data)) return false;
  const d = json.data;
  return (
    typeof d.orderId === "number" &&
    typeof d.polymarketOrderHash === "string" &&
    typeof d.orderHash === "string" &&
    isPolyswapTxCall(d.tx) &&
    Array.isArray(d.batchTx) &&
    d.batchTx.every(isPolyswapTxCall) &&
    typeof d.sellToken === "string" &&
    typeof d.sellAmount === "string" &&
    typeof d.vaultRelayer === "string"
  );
}

function readErrorMessage(json: unknown): string | undefined {
  if (!isRecord(json)) return undefined;
  const message = typeof json.message === "string" ? json.message : undefined;
  const error = typeof json.error === "string" ? json.error : undefined;
  return message ?? error;
}

function isSuccessEnvelope(value: unknown): value is { success: true } {
  return isRecord(value) && value.success === true;
}

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

  /**
   * Single consolidated call to create a PolySwap order. The backend persists
   * a draft, posts the Polymarket CLOB order, builds the on-chain calldata,
   * and returns both a single-tx form and an approve+create batch.
   */
  async createPolyswapOrder(
    body: CreatePolyswapOrderRequest
  ): Promise<CreatePolyswapOrderResponse> {
    const response = await fetch(`${this.baseUrl}/polyswap/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: unknown = await response.json();
    if (!response.ok || !isCreateOrderSuccess(json)) {
      const message = readErrorMessage(json) ?? `HTTP ${response.status}`;
      throw new Error(message);
    }
    return json.data;
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

  /**
   * Off-chain draft cancellation: DELETEs the row.
   * Auth: EIP-191 message signed via useSignAction("cancel_draft", String(orderId)).
   */
  async deleteDraftOrder(orderId: number, signature: string, timestamp: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/polyswap/orders/id/${orderId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature, timestamp }),
    });
    const json: unknown = await res.json();
    if (!res.ok || !isSuccessEnvelope(json)) {
      throw new Error(readErrorMessage(json) ?? `HTTP ${res.status}`);
    }
  }

  /**
   * Server-side finalisation after the on-chain ComposableCoW.remove(orderHash)
   * has been confirmed. Auth: EIP-191 message signed via
   * useSignAction("notify_remove", String(orderId)).
   */
  async notifyRemoveOrder(orderId: number, signature: string, timestamp: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/polyswap/orders/id/${orderId}/notify-remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature, timestamp }),
    });
    const json: unknown = await res.json();
    if (!res.ok || !isSuccessEnvelope(json)) {
      throw new Error(readErrorMessage(json) ?? `HTTP ${res.status}`);
    }
  }
}

export const apiService = new ApiService();
