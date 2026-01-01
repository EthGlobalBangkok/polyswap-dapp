-- Migration: Add sold_positions table for tracking auto-sold Polymarket positions
-- Run this on existing databases to add support for the position seller service

\c polyswap;

-- Create sold_positions table for tracking auto-sold Polymarket positions
-- This prevents the system from holding risk after BUY orders are executed
CREATE TABLE IF NOT EXISTS sold_positions (
    id SERIAL PRIMARY KEY,
    asset_id VARCHAR(100) NOT NULL, -- Polymarket token ID
    condition_id VARCHAR(66) NOT NULL, -- Polymarket condition ID
    size DECIMAL(20, 6) NOT NULL, -- Number of shares sold
    sell_price DECIMAL(10, 6) NOT NULL, -- Price at which we sold
    current_price DECIMAL(10, 6) NOT NULL, -- Market price at time of sale
    order_id VARCHAR(100) NOT NULL, -- Polymarket order ID
    market_title TEXT, -- Market title for reference
    outcome VARCHAR(100), -- Outcome name (Yes/No)
    sold_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_size CHECK (size > 0),
    CONSTRAINT valid_sell_price CHECK (sell_price > 0),
    CONSTRAINT valid_current_price CHECK (current_price >= 0)
);

-- Create indexes for sold_positions
CREATE INDEX IF NOT EXISTS idx_sold_positions_asset_id ON sold_positions(asset_id);
CREATE INDEX IF NOT EXISTS idx_sold_positions_condition_id ON sold_positions(condition_id);
CREATE INDEX IF NOT EXISTS idx_sold_positions_sold_at ON sold_positions(sold_at);
CREATE INDEX IF NOT EXISTS idx_sold_positions_order_id ON sold_positions(order_id);

-- Grant permissions
GRANT ALL PRIVILEGES ON sold_positions TO polyswap_user;
GRANT USAGE, SELECT ON SEQUENCE sold_positions_id_seq TO polyswap_user;

-- Done
SELECT 'Migration 002: sold_positions table created successfully' AS status;

