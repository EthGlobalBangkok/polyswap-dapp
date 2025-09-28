# 🔄 PolySwap

**Automated DeFi swaps triggered by prediction market outcomes on Polygon**

PolySwap is a decentralized application that enables users to create conditional swap orders that execute automatically when specific prediction market outcomes are resolved. Built on top of CoW Swap's conditional order framework, PolySwap bridges the gap between prediction markets and DeFi trading.

## 🎯 What Is PolySwap?

PolySwap allows you to:

- **🎲 Create Conditional Orders**: Set up token swaps that only execute when your predicted market outcome occurs
- **📊 Browse Markets**: Explore Polymarket prediction markets directly in the interface
- **⚡ Automatic Execution**: Orders execute automatically when market conditions resolve in your favor
- **🔒 Trustless**: Built on CoW Swap's proven conditional order infrastructure
- **💸 Gas Efficient**: Leverages batch auctions and off-chain order matching
- **🔐 Safe Wallet Integration**: Secure multi-signature wallet support for institutional users

### Example Use Case

> *"I believe if Trump wins the 2024 election, crypto market will go up. If my Polymarket bet gets filled, I want to automatically swap 1000 USDC for ETH at current market rates."*

With PolySwap, you can create this conditional order that will only execute if the condition is met, eliminating the need to manually monitor the prediction market outcome and execute the trade yourself.

> 🎥 **[Watch the PolySwap demo video](./public/polyswap_demo.mp4)**


## 🏗️ Architecture Overview

PolySwap consists of integrated frontend and backend components:

### 🖥️ Frontend (Next.js)
- **Modern React Interface**: Built with Next.js 15 and React 19
- **Market Browser**: Search and explore Polymarket prediction markets
- **Order Creation Flow**: Intuitive interface for setting up conditional swaps with Polymarket integration
- **Order Management**: Track and manage your active conditional orders
- **Safe Wallet Integration**: Gnosis Safe support with WalletConnect for secure transactions
- **Real-time Updates**: Live order status and market data synchronization

### ⚙️ Backend (Node.js + TypeScript)
- **Next.js API Routes**: Integrated API serving market data and order information
- **Blockchain Listener**: Monitors Polygon for PolySwap order events and trade executions
- **PostgreSQL Database**: Stores market data, order history, and order UIDs
- **Real-time Processing**: Indexes and processes orders as they're created
- **Order UID Calculation**: Automatic calculation and storage of CoW Protocol order UIDs

📚 **[View Detailed Backend Documentation with API endpoints →](./Backend.md)**

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and pnpm (preferred package manager)
- Docker and Docker Compose (for the database)

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.sample .env
# Edit .env with your configuration
```

### Running the Application

1. **Start the database**:
   ```bash
   pnpm db:up
   ```

2. **Start the backend services**:
   ```bash
   # Start blockchain listener + market updater
   pnpm start:listener
   ```

3. **Start the frontend**:
   ```bash
   pnpm dev
   ```

4. **Access the application**:
   - Frontend: `http://localhost:3000`

## 🔧 Available Scripts

### Frontend Development
```bash
pnpm dev          # Start Next.js development server (port 3000)
pnpm build        # Build production frontend
pnpm start        # Start production frontend
pnpm lint         # Run ESLint
```

### Backend Services
```bash
pnpm start:listener               # Start blockchain listener + market updater
pnpm start:listener-only          # Start only blockchain listener
pnpm start:market-updater         # Start only market updater (via listener)
pnpm start:market-updater-standalone # Start standalone market updater
```

### Market Data Management
```bash
pnpm saveMarkets   # Fetch markets from Polymarket API to data.json
pnpm db:import     # Import markets from data.json to database
```

### Database Management
```bash
pnpm db:up         # Start PostgreSQL container
pnpm db:down       # Stop PostgreSQL container
pnpm db:logs       # View database logs
```

### Utility Scripts
```bash
pnpm get-polymarket-creds         # Get Polymarket credentials
pnpm cancel-polymarket-orders     # Cancel all Polymarket orders
pnpm sell-polymarket-positions    # Sell all Polymarket positions
```

## 🔄 Automatic Market Updates

PolySwap includes an automatic market update service that keeps your database synchronized with the latest Polymarket data.

### Configuration

Set the update interval in your `.env` file:
```bash
MARKET_UPDATE_INTERVAL_MINUTES=5  # Update every 5 minutes (default)
AUTO_REMOVE_CLOSED_MARKETS=true   # Remove closed markets automatically
```

### Running Options

1. **Full Service** (Recommended for production):
   ```bash
   pnpm start:listener  # Runs both blockchain listener and market updater
   ```

2. **Market Updater Only**:
   ```bash
   pnpm start:market-updater  # Market updates via listener with --market-update-only flag
   # OR
   pnpm start:market-updater-standalone  # Standalone market updater script
   ```

3. **Blockchain Listener Only**:
   ```bash
   pnpm start:listener-only  # Only listens for on-chain events
   ```

### How It Works

- Fetches active markets from Polymarket API every X minutes
- Updates existing markets and adds new ones to the database
- Uses optimized batching to avoid overwhelming the API/database
- Automatically handles errors and retries
- Provides detailed logging for monitoring

## ⚙️ Environment Configuration

Key environment variables (see `.env.sample`):

### Database
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=polyswap
DB_USER=postgres
DB_PASSWORD=your_password
```

### Polymarket API
```bash
CLOB_API_KEY=your_api_key
CLOB_SECRET=your_secret
CLOB_PASS_PHRASE=your_passphrase
```
> **ℹ️ Info:** You can generate these Polymarket API credentials with the script:
> ```
> pnpm get-polymarket-creds
> ```


### Blockchain Configuration
```bash
RPC_URL=https://polygon-rpc.com/
STARTING_BLOCK=76437998
COMPOSABLE_COW=0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74
NEXT_PUBLIC_POLYSWAP_HANDLER=0x65a5B712F34d8219A4c70451353D2F6A80e6703c
EXTENSIBLE_FALLBACK_HANDLER=0x2f55e8b20D0B9FEFA187AA7d00B6Cbe563605bF5
```

## 💰 Fund Flow Architecture

The following diagram illustrates how funds move through the PolySwap system during a conditional order lifecycle:

```mermaid
sequenceDiagram
  Actor User
  participant Dapp as Polyswap dApp
  participant PO as Polymarket OrderBook
  participant Safe as Safe Wallet (Fund Custody)
box onchain
    participant SellToken as Sell Token Contract (USDC)
    participant CC as ComposableCoW Contract
    participant PH as Polyswap Handler
    participant Polymarket as Polymarket Contract
    participant BuyToken as Buy Token Contract (COW)
end
    participant CS as CoW Settlement Contract
    participant WT as Watch Tower
    participant CP as CoW Protocol

  Note over User, Safe: Phase 1: Order Setup & Fund Preparation
  User->>Dapp: Choose market & configure order (sellAmount, buyAmount)
  Dapp->>User: Check wallet balance for sellAmount
  
  alt Insufficient Balance
    Dapp-->>User: Error: Insufficient funds
  else Sufficient Balance
    Dapp-->>PO: Create Polymarket limit order (condition trigger)
    PO-->>Dapp: Return polymarket order hash
    
    Note over Safe, SellToken: Phase 2: Token Approval & Transaction Batch
    Dapp->>Safe: Check current token allowance for ComposableCoW
    alt Insufficient Allowance
      Dapp->>Safe: Prepare batch: [Approval TX, CreateOrder TX]
      Safe->>SellToken: approve(ComposableCoW, MAX_UINT256)
      Note over Safe: Funds remain in Safe, only approval granted
    else Sufficient Allowance
      Dapp->>Safe: Prepare single TX: [CreateOrder TX]
    end
    
    User->>Safe: Sign transaction batch
    Safe->>CC: createWithContext(orderParams, valueFactory, data)
    Note over Safe: ✅ Funds still remain in user's Safe wallet
    
    CC->>CC: Store conditional order parameters
    CC-->>WT: Emit ConditionalOrderCreated(owner, params)
    WT-->>CP: Register conditional order in orderbook
  end

  Note over CP, CS: Phase 3: Continuous Order Monitoring (Every Block)
  loop Every Block Until Condition Met or Expiry
    CS->>Safe: Call isValidSignature(orderHash, signature)
    Safe->>CC: Delegate to isValidSafeSignature()
    CC->>PH: Call verify(order) to check condition
    PH->>Polymarket: getOrderStatus(polymarket_order_hash)
    Polymarket-->>PH: Return order status (filled/remaining)
    
    alt Polymarket Order Not Filled
      PH-->>CC: Condition NOT met - revert with POLL_TRY_NEXT_BLOCK
      CC-->>Safe: Order invalid (condition not met)
      Safe-->>CS: Invalid signature
      Note over CS: Skip execution, try next block
    else Polymarket Order Filled
      PH-->>CC: ✅ Condition MET - order valid
      CC-->>Safe: Order valid
      Safe-->>CS: Valid signature
      Note over CS: Proceed to execution
    end
  end

  Note over CS, BuyToken: Phase 4: Order Execution & Fund Transfer
  alt Condition Met
    Note over CS: Settlement begins - funds will move
    CS->>Safe: Execute delegatecall for fund transfer
    Safe->>SellToken: transfer(CoW Settlement, sellAmount)
    Note over SellToken: 💰 User funds leave Safe wallet
    
    CS->>CS: Execute swap logic internally
    CS->>BuyToken: transfer(Safe, buyAmount)
    Note over BuyToken: 💰 User receives buy tokens in Safe
    
    CS->>CS: Emit Trade(owner, sellToken, buyToken, sellAmount, buyAmount, feeAmount, orderUid)
    CS-->>Dapp: Trade event notification
    Dapp->>Dapp: Update order status to "executed"
    
    Note over User: ✅ Swap completed: User exchanged sellAmount for buyAmount
  else Condition Never Met (Order Expires)
    Note over Safe: 💰 Funds remain safely in user's Safe wallet
    CS-->>Dapp: Order expired
    Dapp->>Dapp: Update order status to "expired"
  end

  Note over User, Dapp: Phase 5: Final State
  alt Order Executed
    Note over User: Final State: User has buyTokens, spent sellTokens + fees
  else Order Expired/Cancelled
    Note over User: Final State: User retains original sellTokens (no loss)
  end
```
> **Note:** If the diagram does not display correctly, here is the diagram as a PNG:  
> [polyswap_mermaid.png](./public/polyswap_mermaid.png)

## 🔐 Safe Wallet Integration

PolySwap is designed to work exclusively with Gnosis Safe wallets for enhanced security:

### Supported Connection Methods
- **Safe Apps (TODO)**: Run PolySwap directly inside the Safe interface
- **WalletConnect**: Connect external Safe wallets via WalletConnect protocol

## 🧑‍💻 Authors

| [<img src="https://github.com/Intermarch3.png?size=85" width=85><br><sub>Lucas Leclerc</sub>](https://github.com/Intermarch3) | [<img src="https://github.com/Pybast.png?size=85" width=85><br><sub>Baptiste Florentin</sub>](https://github.com/Pybast) |
| :---: | :---: |