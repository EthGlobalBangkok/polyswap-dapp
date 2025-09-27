\c polyswap;

-- Add columns to track when orders are filled
ALTER TABLE polyswap_orders
ADD COLUMN IF NOT EXISTS filled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS fill_transaction_hash VARCHAR(66),
ADD COLUMN IF NOT EXISTS fill_block_number BIGINT,
ADD COLUMN IF NOT EXISTS fill_log_index INTEGER,
ADD COLUMN IF NOT EXISTS actual_sell_amount DECIMAL(78, 0),
ADD COLUMN IF NOT EXISTS actual_buy_amount DECIMAL(78, 0),
ADD COLUMN IF NOT EXISTS fee_amount DECIMAL(78, 0);

-- Create indexes for the new fill-related columns
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_filled_at ON polyswap_orders(filled_at);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_fill_transaction_hash ON polyswap_orders(fill_transaction_hash);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_fill_block_number ON polyswap_orders(fill_block_number);

-- Add comments to document the new columns
COMMENT ON COLUMN polyswap_orders.filled_at IS 'Timestamp when the order was filled';
COMMENT ON COLUMN polyswap_orders.fill_transaction_hash IS 'Transaction hash of the Trade event that filled this order';
COMMENT ON COLUMN polyswap_orders.fill_block_number IS 'Block number where the order was filled';
COMMENT ON COLUMN polyswap_orders.fill_log_index IS 'Log index of the Trade event within the fill transaction';
COMMENT ON COLUMN polyswap_orders.actual_sell_amount IS 'Actual amount of sell tokens traded';
COMMENT ON COLUMN polyswap_orders.actual_buy_amount IS 'Actual amount of buy tokens received';
COMMENT ON COLUMN polyswap_orders.fee_amount IS 'Fee amount paid for the trade';