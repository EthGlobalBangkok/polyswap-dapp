"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import type { Hex } from "viem";
import { apiService } from "@/services/api";
import type { DatabasePolyswapOrder } from "@/backend/interfaces/PolyswapOrder";
import type { SwapStatus } from "@/types/design";
import { useTokens, type Token } from "@/hooks/useTokens";

export interface OrderViewModel {
  id: string;
  numericId: number;
  status: SwapStatus;
  nickname: string;
  marketId: string | null;
  sellSymbol: string;
  buySymbol: string;
  sellAmount: number;
  minBuyAmount: number;
  startTime: Date;
  endTime: Date;
  /** Synthetic spark — replaced by real history when available. */
  spark: number[];
  /** Threshold used for visual feedback. Real value comes from order params later. */
  threshold: number;
  /** Underlying DB lifecycle status — used by cancel logic (off-chain delete vs. on-chain remove). */
  phase: "draft" | "live" | "filled" | "canceled" | "errored";
  /** On-chain order hash, populated once the listener observes ConditionalOrderCreated. Null while draft. */
  orderHash: Hex | null;
  /** Most recent CoW conditional-order error name (e.g. PollTryAtBlock). */
  lastErrorName: string | null;
  /** Human-readable reason emitted alongside the conditional-order revert. */
  lastErrorReason: string | null;
  /**
   * Block number (PollTryAtBlock) or epoch seconds (PollTryAtEpoch) the order
   * said to retry at. Null for terminal / next-block variants.
   */
  lastErrorRetryAt: number | null;
  /** Discrete CoW orderbook status (open / fulfilled / cancelled / …). */
  cowOrderStatus: string | null;
}

const STALE = 30_000;

function mapStatus(status: DatabasePolyswapOrder["status"]): SwapStatus {
  switch (status) {
    case "filled":
      return "done";
    case "canceled":
      return "cancelled";
    case "errored":
      return "cancelled";
    case "live":
      return "waiting";
    case "draft":
      return "waiting";
  }
}

function shortNickname(market: string | null, buy: string): string {
  if (!market) return `Watch → ${buy}`;
  const trimmed = market.length > 28 ? `${market.slice(0, 25)}…` : market;
  return `${trimmed} → ${buy}`;
}

function syntheticSpark(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const out: number[] = [];
  let v = 0.4 + (Math.abs(h) % 30) / 100;
  for (let i = 0; i < 60; i++) {
    h = (h * 9301 + 49297) | 0;
    v = Math.max(0.05, Math.min(0.95, v + ((h % 1000) / 1000 - 0.5) * 0.05));
    out.push(v);
  }
  return out;
}

function buildTokenMap(tokens: Token[] | undefined): Map<string, Token> {
  const map = new Map<string, Token>();
  for (const t of tokens ?? []) map.set(t.address.toLowerCase(), t);
  return map;
}

export function toOrderView(
  o: DatabasePolyswapOrder,
  tokenMap: Map<string, Token>,
  marketTitle: string | null
): OrderViewModel {
  const sellMeta = tokenMap.get(o.sell_token.toLowerCase());
  const buyMeta = tokenMap.get(o.buy_token.toLowerCase());
  const sellSym = sellMeta?.symbol ?? "?";
  const buySym = buyMeta?.symbol ?? "?";
  const sellDecimals = sellMeta?.decimals ?? 18;
  const buyDecimals = buyMeta?.decimals ?? 18;
  return {
    id: String(o.id),
    numericId: o.id,
    status: mapStatus(o.status),
    nickname: shortNickname(marketTitle, buySym),
    marketId: o.market_id ? String(o.market_id) : null,
    sellSymbol: sellSym,
    buySymbol: buySym,
    sellAmount: Number(BigInt(o.sell_amount)) / 10 ** sellDecimals,
    minBuyAmount: Number(BigInt(o.min_buy_amount)) / 10 ** buyDecimals,
    startTime: new Date(o.start_time),
    endTime: new Date(o.end_time),
    spark: syntheticSpark(String(o.id)),
    threshold: 0.7,
    phase: o.status,
    orderHash: o.order_hash ? (o.order_hash as Hex) : null,
    lastErrorName: o.last_error_name ?? null,
    lastErrorReason: o.last_error_reason ?? null,
    lastErrorRetryAt:
      o.last_error_retry_at !== null && o.last_error_retry_at !== undefined
        ? Number(o.last_error_retry_at)
        : null,
    cowOrderStatus: o.cow_order_status ?? null,
  };
}

interface UseOrdersResult {
  orders: OrderViewModel[];
  isLoading: boolean;
  isError: boolean;
  walletConnected: boolean;
}

export function useOrders(): UseOrdersResult {
  const { address, isConnected } = useAccount();
  const tokensQ = useTokens();

  const query = useQuery({
    queryKey: ["orders", address],
    queryFn: async () => {
      if (!address) return [];
      const res = await apiService.getOrdersByOwner(address);
      if (!res.success || !res.data) return [];
      return res.data;
    },
    enabled: Boolean(address),
    staleTime: STALE,
  });

  const tokenMap = buildTokenMap(tokensQ.data);

  // We don't fetch market titles inline — they're optional and the row still
  // renders without them. A follow-up could batch market lookups by id.
  const orders = (query.data ?? []).map((o) => toOrderView(o, tokenMap, null));

  return {
    orders,
    isLoading: query.isLoading || tokensQ.isLoading,
    isError: query.isError || tokensQ.isError,
    walletConnected: isConnected,
  };
}

export function useOrder(orderId: string): {
  order: OrderViewModel | null;
  isLoading: boolean;
  isError: boolean;
  walletConnected: boolean;
} {
  const { orders, isLoading, isError, walletConnected } = useOrders();
  const order = orders.find((o) => o.id === orderId) ?? null;
  return { order, isLoading, isError, walletConnected };
}
