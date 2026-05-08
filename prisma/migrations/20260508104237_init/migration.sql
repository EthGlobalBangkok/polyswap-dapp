-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "markets" (
    "id" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "event_slug" VARCHAR(255),
    "question" TEXT NOT NULL,
    "description" TEXT,
    "category" VARCHAR(64),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outcomes" JSONB NOT NULL DEFAULT '[]',
    "volume" DECIMAL(30,6) DEFAULT 0,
    "liquidity" DECIMAL(30,6) DEFAULT 0,
    "end_date" TIMESTAMPTZ,
    "clob_token_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN DEFAULT true,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "search_vec" tsvector,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_index" (
    "tag" TEXT NOT NULL,
    "market_count" INTEGER NOT NULL,

    CONSTRAINT "tag_index_pkey" PRIMARY KEY ("tag")
);

-- CreateTable
CREATE TABLE "polyswap_orders" (
    "id" SERIAL NOT NULL,
    "order_hash" VARCHAR(66),
    "owner" VARCHAR(42) NOT NULL,
    "handler" VARCHAR(42),
    "sell_token" VARCHAR(42) NOT NULL,
    "buy_token" VARCHAR(42) NOT NULL,
    "sell_amount" DECIMAL(78,0) NOT NULL,
    "min_buy_amount" DECIMAL(78,0) NOT NULL,
    "start_time" TIMESTAMPTZ NOT NULL,
    "end_time" TIMESTAMPTZ NOT NULL,
    "polymarket_order_hash" VARCHAR(66),
    "app_data" VARCHAR(66),
    "block_number" BIGINT,
    "transaction_hash" VARCHAR(66),
    "log_index" INTEGER,
    "market_id" VARCHAR(80),
    "outcome_selected" VARCHAR(256),
    "bet_percentage" DECIMAL(5,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "order_uid" VARCHAR(114),
    "salt" VARCHAR(66),
    "last_error_name" VARCHAR(64),
    "last_error_reason" TEXT,
    "last_error_retry_at" BIGINT,
    "last_checked_at" TIMESTAMPTZ,
    "cow_order_status" VARCHAR(32),
    "filled_at" TIMESTAMPTZ,
    "fill_transaction_hash" VARCHAR(66),
    "fill_block_number" BIGINT,
    "fill_log_index" INTEGER,
    "actual_sell_amount" DECIMAL(78,0),
    "actual_buy_amount" DECIMAL(78,0),
    "fee_amount" DECIMAL(78,0),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "polyswap_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sold_positions" (
    "id" SERIAL NOT NULL,
    "asset_id" VARCHAR(100) NOT NULL,
    "condition_id" VARCHAR(66) NOT NULL,
    "size" DECIMAL(20,6) NOT NULL,
    "sell_price" DECIMAL(10,6) NOT NULL,
    "current_price" DECIMAL(10,6) NOT NULL,
    "order_id" VARCHAR(100) NOT NULL,
    "market_title" TEXT,
    "outcome" VARCHAR(100),
    "sold_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sold_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listener_state" (
    "key" VARCHAR(64) NOT NULL,
    "value" BIGINT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listener_state_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "markets_slug_key" ON "markets"("slug");

-- CreateIndex
CREATE INDEX "markets_category_idx" ON "markets"("category");

-- CreateIndex
CREATE INDEX "markets_volume_idx" ON "markets"("volume" DESC);

-- CreateIndex
CREATE INDEX "markets_liquidity_idx" ON "markets"("liquidity" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "polyswap_orders_order_hash_key" ON "polyswap_orders"("order_hash");

-- CreateIndex
CREATE INDEX "idx_polyswap_orders_order_hash" ON "polyswap_orders"("order_hash");

-- CreateIndex
CREATE INDEX "idx_polyswap_orders_owner" ON "polyswap_orders"("owner");

-- CreateIndex
CREATE INDEX "idx_polyswap_orders_handler" ON "polyswap_orders"("handler");

-- CreateIndex
CREATE INDEX "idx_polyswap_orders_sell_token" ON "polyswap_orders"("sell_token");

-- CreateIndex
CREATE INDEX "idx_polyswap_orders_buy_token" ON "polyswap_orders"("buy_token");

-- CreateIndex
CREATE INDEX "idx_polyswap_orders_start_time" ON "polyswap_orders"("start_time");

-- CreateIndex
CREATE INDEX "idx_polyswap_orders_end_time" ON "polyswap_orders"("end_time");

-- CreateIndex
CREATE INDEX "idx_polyswap_orders_block_number" ON "polyswap_orders"("block_number");

-- CreateIndex
CREATE INDEX "idx_polyswap_orders_polymarket_hash" ON "polyswap_orders"("polymarket_order_hash");

-- CreateIndex
CREATE INDEX "idx_polyswap_orders_market_id" ON "polyswap_orders"("market_id");

-- CreateIndex
CREATE INDEX "idx_polyswap_orders_status" ON "polyswap_orders"("status");

-- CreateIndex
CREATE INDEX "idx_polyswap_orders_order_uid" ON "polyswap_orders"("order_uid");

-- CreateIndex
CREATE INDEX "idx_sold_positions_asset_id" ON "sold_positions"("asset_id");

-- CreateIndex
CREATE INDEX "idx_sold_positions_condition_id" ON "sold_positions"("condition_id");

-- CreateIndex
CREATE INDEX "idx_sold_positions_sold_at" ON "sold_positions"("sold_at");

-- CreateIndex
CREATE INDEX "idx_sold_positions_order_id" ON "sold_positions"("order_id");

-- AddForeignKey
ALTER TABLE "polyswap_orders" ADD CONSTRAINT "fk_market" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Nile does not support GENERATED columns, so `search_vec` stays as a plain
-- `tsvector` populated by app code on every market upsert (see
-- DatabaseService.upsertMarket). Read back into Prisma as Unsupported("tsvector").

-- GIN indexes for full-text search (search_vec) and tag-array filtering (tags).
CREATE INDEX "markets_search_vec_idx" ON "markets" USING GIN ("search_vec");
CREATE INDEX "markets_tags_gin_idx"   ON "markets" USING GIN ("tags");

-- Partial index used by the "active markets ending soon" queries.
CREATE INDEX "markets_active_end_date_idx" ON "markets" ("active", "end_date") WHERE "active" = TRUE;

-- tag_index lookup helpers used by the search-suggestion dropdown.
-- Tags are stored already lowercased (Nile blocks function calls in index
-- column expressions, so lower(tag) at write time is the simplest path).
CREATE INDEX "tag_index_tag_idx"   ON "tag_index" ("tag" text_pattern_ops);
CREATE INDEX "tag_index_count_idx" ON "tag_index" ("market_count" DESC);

-- Domain CHECK constraints. Prisma can't express these in the schema.
ALTER TABLE "polyswap_orders"
  ADD CONSTRAINT "valid_sell_amount"    CHECK ("sell_amount" > 0),
  ADD CONSTRAINT "valid_min_buy_amount" CHECK ("min_buy_amount" > 0),
  ADD CONSTRAINT "valid_times"          CHECK ("end_time" > "start_time"),
  ADD CONSTRAINT "valid_status"         CHECK ("status" IN ('draft', 'live', 'filled', 'canceled', 'errored')),
  ADD CONSTRAINT "valid_bet_percentage" CHECK ("bet_percentage" IS NULL OR ("bet_percentage" >= 0 AND "bet_percentage" <= 100));

ALTER TABLE "sold_positions"
  ADD CONSTRAINT "valid_size"          CHECK ("size" > 0),
  ADD CONSTRAINT "valid_sell_price"    CHECK ("sell_price" > 0),
  ADD CONSTRAINT "valid_current_price" CHECK ("current_price" >= 0);
