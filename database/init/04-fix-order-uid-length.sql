\c polyswap;

-- Fix order UID column length - need to store 56 bytes (0x + 112 hex chars = 114 total)
ALTER TABLE polyswap_orders
ALTER COLUMN order_uid TYPE VARCHAR(114);