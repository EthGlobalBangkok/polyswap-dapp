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

### Example Use Case

> *"I believe if Trump win the 2024 election, crypto market will go up. If 70% of people think he will wins, I want to automatically swap 1000 USDC for ETH at current market rates."*

With PolySwap, you can create this conditional order that will only execute if the condition is met, eliminating the need to manually monitor the election outcome and execute the trade yourself.

## 🏗️ Architecture Overview

PolySwap consists of two main components:

### 🖥️ Frontend (Next.js)
- **Modern React Interface**: Built with Next.js 15 and React 19
- **Market Browser**: Search and explore Polymarket prediction markets
- **Order Creation**: Intuitive interface for setting up conditional swaps
- **Order Management**: Track and manage your active conditional orders
- **Wallet Integration**: Wallet connection with Wagmi.sh and Privy

### ⚙️ Backend (Node.js + TypeScript)
- **RESTful API**: Serves market data and order information
- **Blockchain Listener**: Monitors Polygon for PolySwap order events
- **PostgreSQL Database**: Stores market data and order history
- **Real-time Processing**: Indexes and processes orders as they're created

📚 **[View Detailed Backend Documentation with API endpoints →](./Backend.md)**

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (for the database)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Running the Application

1. **Start the database**:
   ```bash
   npm run db:up
   ```

2. **Start the backend services**:
   ```bash
   # Terminal 1: API Server
   npm run start:api
   
   # Terminal 2: Blockchain Listener
   npm run start:listener
   ```

3. **Start the frontend**:
   ```bash
   npm run dev
   ```

4. **Access the application**:
   - Frontend: `http://localhost:8080`
   - API: `http://localhost:3000`

## 🔧 Available Scripts

### Frontend Development
```bash
npm run dev          # Start Next.js development server
npm run build        # Build production frontend
npm run start        # Start production frontend
npm run lint         # Run ESLint
```

### Backend Services
```bash
npm run start:api      # Start API server
npm run start:listener # Start blockchain listener
```

### Database Management
```bash
npm run db:up         # Start PostgreSQL container
npm run db:down       # Stop PostgreSQL container
npm run db:logs       # View database logs
npm run db:import     # Import market data
```

### Data Management
```bash
npm run saveMarkets   # Fetch latest market data from Polymarket
```

## 🧑‍💻 Authors

| [<img src="https://github.com/Intermarch3.png?size=85" width=85><br><sub>Lucas Leclerc</sub>](https://github.com/Intermarch3) | [<img src="https://github.com/Pybast.png?size=85" width=85><br><sub>Baptiste Florentin</sub>](https://github.com/Pybast) |
| :---: | :---: |
