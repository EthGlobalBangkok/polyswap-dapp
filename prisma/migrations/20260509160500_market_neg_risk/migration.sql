-- True for Polymarket NegRisk markets — they settle through `0xe2222d…`
-- (NegRiskCtfExchange) instead of the standard `0xE111180000…`. The on-chain
-- Polyswap handler must be picked accordingly so `verify()` reads from the
-- right exchange.
ALTER TABLE "markets" ADD COLUMN "neg_risk" BOOLEAN NOT NULL DEFAULT FALSE;
