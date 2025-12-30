export interface PolyswapOrderData {
  sellToken: string; // hex address
  buyToken: string; // hex address
  receiver: string; // hex address
  sellAmount: string; // uint256 as string
  minBuyAmount: string; // uint256 as string
  t0: string; // uint256 timestamp as string
  t: string; // uint256 timestamp as string
  polymarketOrderHash: string; // bytes32 hex string
  appData: string; // bytes32 hex string
}

export interface ConditionalOrderParams {
  handler: string; // address
  salt: string; // bytes32
  staticInput: string; // bytes (ABI-encoded)
}

export interface ConditionalOrderCreatedEvent {
  owner: string;
  params: ConditionalOrderParams;
  orderHash?: string; // calculated hash
  blockNumber?: number;
  transactionHash?: string;
  logIndex?: number;
}

export interface PolyswapOrderRecord {
  orderHash: string;
  owner: string;
  handler: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  minBuyAmount: string;
  startTime: number;
  endTime: number;
  polymarketOrderHash: string;
  appData: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  createdAt: Date;
}

// Database interface for the polyswap_orders table
export interface DatabasePolyswapOrder {
  id: number;
  order_hash: string | null;
  owner: string;
  handler: string;
  sell_token: string;
  buy_token: string;
  sell_amount: string;
  min_buy_amount: string;
  start_time: Date;
  end_time: Date;
  polymarket_order_hash: string;
  app_data: string;
  block_number: number;
  transaction_hash: string;
  log_index: number;
  market_id: string | null;
  outcome_selected: string | null; // Selected outcome index
  bet_percentage: number | null; // Bet percentage (0-100)
  status: "draft" | "live" | "filled" | "canceled";
  order_uid: string | null; // CoW Protocol order UID
  created_at: Date;
  updated_at: Date;
}
