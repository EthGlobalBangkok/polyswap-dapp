ALTER TABLE "polyswap_orders" DROP CONSTRAINT IF EXISTS "valid_status";
ALTER TABLE "polyswap_orders"
  ADD CONSTRAINT "valid_status" CHECK ("status" IN ('draft', 'live', 'filled', 'canceled', 'errored', 'expired'));
