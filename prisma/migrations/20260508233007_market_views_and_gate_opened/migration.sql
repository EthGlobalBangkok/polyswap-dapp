-- Market view counter (feeds the "interest" sort as a slight popularity boost).
ALTER TABLE "markets" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0;

-- Stamped by orderHealthCheck the first time `getTradeableOrderWithSignature`
-- succeeds — i.e. the Polymarket condition has fired and the conditional
-- order is actually tradeable. Lets the UI distinguish "still waiting for
-- trigger" from "trigger fired, waiting for swap to settle".
ALTER TABLE "polyswap_orders" ADD COLUMN "gate_opened_at" TIMESTAMPTZ;
