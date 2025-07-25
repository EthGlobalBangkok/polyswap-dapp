import express from 'express';
import marketRoutes from './routes/market';
import polyswap_orderRoutes from './routes/polyswapOrder';

const app = express();
const port = 3000;

app.use(express.json());

// market routes
app.use('/api/markets', marketRoutes);
app.use('/api/polyswap', polyswap_orderRoutes)

// Health check endpoint
app.get('/health', (req: any, res: any) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req: any, res: any) => {
  res.send('Welcome to the Polyswap API!');
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`API endpoints:`);
  console.log(`  GET /api/markets/top - Top 50 markets by volume`);
  console.log(`  GET /api/markets/search?q=keywords - Search markets`);
  console.log(`  GET /api/markets/:id - Get market by ID or condition ID`);
  console.log(`  GET /api/markets - Get all markets with pagination`);
  console.log(`  GET /api/polyswap/orders/:owner - Get orders by owner address`);
  console.log(`  GET /api/polyswap/orders/hash/:orderHash - Get order by hash`);
  console.log(`  GET /api/polyswap/orders - Get all orders with pagination`);
  console.log(`  GET /api/polyswap/orders/polymarket/:hash - Get orders by Polymarket hash`);
});