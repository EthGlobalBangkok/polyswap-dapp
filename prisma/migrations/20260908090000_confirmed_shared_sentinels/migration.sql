CREATE TABLE "polymarket_sentinels" (
    "id" SERIAL NOT NULL,
    "market_id" VARCHAR(80) NOT NULL,
    "token_id" VARCHAR(100) NOT NULL,
    "outcome_selected" VARCHAR(256) NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "neg_risk" BOOLEAN NOT NULL DEFAULT false,
    "epoch" INTEGER NOT NULL DEFAULT 1,
    "polymarket_order_hash" VARCHAR(66) NOT NULL,
    "polymarket_maker_amount" DECIMAL(78,0) NOT NULL,
    "signed_order" JSONB NOT NULL,
    "expiration" TIMESTAMPTZ NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'prepared',
    "activation_tx_hash" VARCHAR(66),
    "last_error" TEXT,
    "activated_at" TIMESTAMPTZ,
    "filled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "polymarket_sentinels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "polymarket_sentinels_price_cents_check" CHECK ("price_cents" BETWEEN 1 AND 100),
    CONSTRAINT "polymarket_sentinels_status_check" CHECK (
        "status" IN ('prepared', 'activating', 'live', 'filled', 'canceled', 'failed')
    )
);

ALTER TABLE "polyswap_orders" ADD COLUMN "sentinel_id" INTEGER;

CREATE UNIQUE INDEX "polymarket_sentinels_polymarket_order_hash_key"
    ON "polymarket_sentinels"("polymarket_order_hash");
CREATE UNIQUE INDEX "uq_sentinel_bucket_epoch"
    ON "polymarket_sentinels"("market_id", "token_id", "price_cents", "epoch");
CREATE INDEX "idx_sentinel_reuse"
    ON "polymarket_sentinels"("market_id", "token_id", "price_cents", "status");
CREATE INDEX "idx_sentinel_status" ON "polymarket_sentinels"("status");
CREATE INDEX "idx_polyswap_orders_sentinel_id" ON "polyswap_orders"("sentinel_id");

ALTER TABLE "polymarket_sentinels"
    ADD CONSTRAINT "fk_sentinel_market"
    FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "polyswap_orders"
    ADD CONSTRAINT "fk_polyswap_order_sentinel"
    FOREIGN KEY ("sentinel_id") REFERENCES "polymarket_sentinels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
