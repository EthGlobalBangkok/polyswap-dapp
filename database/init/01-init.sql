\c polyswap;

-- ============================================================
-- Markets: lean search-index only.
-- Live data (prices, outcomes, depth) is fetched client-side
-- from Polymarket Gamma. Only static/searchable fields live here.
-- ============================================================
CREATE TABLE IF NOT EXISTS markets (
  id             VARCHAR(80) PRIMARY KEY,
  slug           VARCHAR(255) NOT NULL UNIQUE,
  question       TEXT NOT NULL,
  category       VARCHAR(64),
  volume         NUMERIC(30, 6) DEFAULT 0,
  liquidity      NUMERIC(30, 6) DEFAULT 0,
  end_date       TIMESTAMPTZ,
  clob_token_ids TEXT[],
  active         BOOLEAN DEFAULT TRUE,
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  -- Full-text search vector; auto-maintained by Postgres (requires pg >= 12)
  search_vec     TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', question)) STORED
);

CREATE INDEX IF NOT EXISTS markets_search_vec_idx       ON markets USING GIN (search_vec);
CREATE INDEX IF NOT EXISTS markets_category_idx         ON markets (category);
CREATE INDEX IF NOT EXISTS markets_volume_idx           ON markets (volume DESC);
CREATE INDEX IF NOT EXISTS markets_liquidity_idx        ON markets (liquidity DESC);
CREATE INDEX IF NOT EXISTS markets_active_end_date_idx  ON markets (active, end_date) WHERE active = TRUE;

-- ============================================================
-- PolySwap Orders: source of truth for conditional orders.
-- Listener writes; status enum: draft | live | filled | canceled
-- ============================================================
CREATE TABLE IF NOT EXISTS polyswap_orders (
  id                    SERIAL PRIMARY KEY,
  order_hash            VARCHAR(66) UNIQUE,
  owner                 VARCHAR(42) NOT NULL,
  handler               VARCHAR(42),
  sell_token            VARCHAR(42) NOT NULL,
  buy_token             VARCHAR(42) NOT NULL,
  sell_amount           DECIMAL(78, 0) NOT NULL,
  min_buy_amount        DECIMAL(78, 0) NOT NULL,
  start_time            TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time              TIMESTAMP WITH TIME ZONE NOT NULL,
  polymarket_order_hash VARCHAR(66),
  app_data              VARCHAR(66),
  block_number          BIGINT,
  transaction_hash      VARCHAR(66),
  log_index             INTEGER,
  market_id             VARCHAR(80),
  outcome_selected      VARCHAR(256),
  bet_percentage        DECIMAL(5, 2),
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',
  order_uid             VARCHAR(114),
  -- Phase 7: salt for getTradeableOrderWithSignature reconstruction (CoW conditional order params)
  salt                  VARCHAR(66),
  -- Phase 7: order failure visibility — populated by orderHealthCheck cron
  last_error_name       VARCHAR(64),
  last_error_reason     TEXT,
  last_error_retry_at   BIGINT,
  last_checked_at       TIMESTAMPTZ,
  cow_order_status      VARCHAR(32),
  filled_at             TIMESTAMP WITH TIME ZONE,
  fill_transaction_hash VARCHAR(66),
  fill_block_number     BIGINT,
  fill_log_index        INTEGER,
  actual_sell_amount    DECIMAL(78, 0),
  actual_buy_amount     DECIMAL(78, 0),
  fee_amount            DECIMAL(78, 0),
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT valid_sell_amount    CHECK (sell_amount > 0),
  CONSTRAINT valid_min_buy_amount CHECK (min_buy_amount > 0),
  CONSTRAINT valid_times          CHECK (end_time > start_time),
  CONSTRAINT valid_status         CHECK (status IN ('draft', 'live', 'filled', 'canceled', 'errored')),
  CONSTRAINT valid_bet_percentage CHECK (bet_percentage IS NULL OR (bet_percentage >= 0 AND bet_percentage <= 100)),
  CONSTRAINT fk_market            FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_polyswap_orders_order_hash       ON polyswap_orders(order_hash);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_owner            ON polyswap_orders(owner);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_handler          ON polyswap_orders(handler);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_sell_token       ON polyswap_orders(sell_token);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_buy_token        ON polyswap_orders(buy_token);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_start_time       ON polyswap_orders(start_time);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_end_time         ON polyswap_orders(end_time);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_block_number     ON polyswap_orders(block_number);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_polymarket_hash  ON polyswap_orders(polymarket_order_hash);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_market_id        ON polyswap_orders(market_id);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_status           ON polyswap_orders(status);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_order_uid        ON polyswap_orders(order_uid);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_polyswap_orders_updated_at
  BEFORE UPDATE ON polyswap_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Sold Positions: protocol's own ledger for auto-sold positions.
-- Unchanged from original schema.
-- ============================================================
CREATE TABLE IF NOT EXISTS sold_positions (
  id              SERIAL PRIMARY KEY,
  asset_id        VARCHAR(100) NOT NULL,
  condition_id    VARCHAR(66) NOT NULL,
  size            DECIMAL(20, 6) NOT NULL,
  sell_price      DECIMAL(10, 6) NOT NULL,
  current_price   DECIMAL(10, 6) NOT NULL,
  order_id        VARCHAR(100) NOT NULL,
  market_title    TEXT,
  outcome         VARCHAR(100),
  sold_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT valid_size          CHECK (size > 0),
  CONSTRAINT valid_sell_price    CHECK (sell_price > 0),
  CONSTRAINT valid_current_price CHECK (current_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sold_positions_asset_id      ON sold_positions(asset_id);
CREATE INDEX IF NOT EXISTS idx_sold_positions_condition_id  ON sold_positions(condition_id);
CREATE INDEX IF NOT EXISTS idx_sold_positions_sold_at       ON sold_positions(sold_at);
CREATE INDEX IF NOT EXISTS idx_sold_positions_order_id      ON sold_positions(order_id);

-- ============================================================
-- Listener state: persisted cursor for the blockchain catch-up.
-- Single-row key/value table; the listener writes the highest
-- block window it has finished processing so the next start-up
-- can resume without rescanning the entire history.
-- ============================================================
CREATE TABLE IF NOT EXISTS listener_state (
  key        VARCHAR(64) PRIMARY KEY,
  value      BIGINT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO polyswap_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO polyswap_user;
GRANT USAGE ON SCHEMA public TO polyswap_user;
