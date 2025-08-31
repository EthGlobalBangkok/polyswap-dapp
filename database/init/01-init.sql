\c polyswap;

CREATE TABLE IF NOT EXISTS markets (
    id VARCHAR(20) PRIMARY KEY,
    question TEXT NOT NULL,
    condition_id VARCHAR(66) NOT NULL UNIQUE, -- Ethereum addresses are 66 chars with 0x prefix
    slug VARCHAR(255), -- Market slug for URL-friendly identifiers
    category VARCHAR(50) NOT NULL DEFAULT 'Other', -- Market category (Politics, Crypto, Sports, etc.)
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    volume DECIMAL(20, 6) NOT NULL DEFAULT 0,
    outcomes JSONB NOT NULL, -- Store as JSON array
    outcome_prices JSONB NOT NULL, -- Store as JSON array
    clob_token_ids JSONB, -- Store as JSON array of CLOB token IDs
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints for data validation
    CONSTRAINT valid_dates CHECK (end_date > start_date),
    CONSTRAINT valid_volume CHECK (volume >= 0)
);

-- Create indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_markets_condition_id ON markets(condition_id);
CREATE INDEX IF NOT EXISTS idx_markets_slug ON markets(slug);
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);
CREATE INDEX IF NOT EXISTS idx_markets_end_date ON markets(end_date);
CREATE INDEX IF NOT EXISTS idx_markets_start_date ON markets(start_date);
CREATE INDEX IF NOT EXISTS idx_markets_volume ON markets(volume);
CREATE INDEX IF NOT EXISTS idx_markets_created_at ON markets(created_at);
CREATE INDEX IF NOT EXISTS idx_markets_updated_at ON markets(updated_at);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_markets_updated_at 
    BEFORE UPDATE ON markets 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create polyswap orders table for blockchain events
CREATE TABLE IF NOT EXISTS polyswap_orders (
    order_hash VARCHAR(66) PRIMARY KEY, -- keccak256 hash of the order params
    owner VARCHAR(42) NOT NULL, -- Ethereum address with 0x prefix
    handler VARCHAR(42) NOT NULL, -- Ethereum address with 0x prefix
    sell_token VARCHAR(42) NOT NULL, -- Ethereum address with 0x prefix
    buy_token VARCHAR(42) NOT NULL, -- Ethereum address with 0x prefix  
    sell_amount DECIMAL(78, 0) NOT NULL, -- Large integers for token amounts (up to 2^256)
    min_buy_amount DECIMAL(78, 0) NOT NULL, -- Large integers for token amounts (up to 2^256)
    start_time TIMESTAMP WITH TIME ZONE NOT NULL, -- t0 converted to timestamp
    end_time TIMESTAMP WITH TIME ZONE NOT NULL, -- t converted to timestamp
    polymarket_order_hash VARCHAR(66) NOT NULL, -- bytes32 hex string
    app_data VARCHAR(66) NOT NULL, -- bytes32 hex string
    block_number BIGINT NOT NULL, -- Block number where event was emitted
    transaction_hash VARCHAR(66) NOT NULL, -- Transaction hash
    log_index INTEGER NOT NULL, -- Log index within the transaction
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- Order status: draft|live|filled|canceled
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints for data validation
    CONSTRAINT valid_sell_amount CHECK (sell_amount > 0),
    CONSTRAINT valid_min_buy_amount CHECK (min_buy_amount > 0),
    CONSTRAINT valid_times CHECK (end_time > start_time),
    CONSTRAINT valid_status CHECK (status IN ('draft', 'live', 'filled', 'canceled'))
);

-- Create indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_owner ON polyswap_orders(owner);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_handler ON polyswap_orders(handler);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_sell_token ON polyswap_orders(sell_token);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_buy_token ON polyswap_orders(buy_token);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_start_time ON polyswap_orders(start_time);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_end_time ON polyswap_orders(end_time);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_block_number ON polyswap_orders(block_number);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_polymarket_hash ON polyswap_orders(polymarket_order_hash);
CREATE INDEX IF NOT EXISTS idx_polyswap_orders_status ON polyswap_orders(status);

-- Create trigger to automatically update updated_at for polyswap_orders
CREATE TRIGGER update_polyswap_orders_updated_at 
    BEFORE UPDATE ON polyswap_orders 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to the user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO polyswap_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO polyswap_user;
GRANT USAGE ON SCHEMA public TO polyswap_user;
