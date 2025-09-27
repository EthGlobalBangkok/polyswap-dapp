\c polyswap;

-- Add order UID column to track the CoW Protocol order UID
ALTER TABLE polyswap_orders
ADD COLUMN IF NOT EXISTS order_uid VARCHAR(66);

-- Create index for the new order UID column for efficient lookups
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_order_uid ON polyswap_orders(order_uid);

-- Add comment to document the new column
COMMENT ON COLUMN polyswap_orders.order_uid IS 'CoW Protocol order UID calculated from order digest, owner, and validTo';