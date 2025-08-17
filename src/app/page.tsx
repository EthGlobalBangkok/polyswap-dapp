'use client';

import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import MarketGrid from '../components/ui/MarketGrid';
import { Market } from '../types/market';
import styles from './page.module.css';

import { WagmiProvider } from 'wagmi'
import { config } from '../wagmi/config'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export default function Home() {
  const handleMarketClick = (market: Market) => {
    // TODO: Navigate to conditional order creation page
    console.log('Creating conditional order for market:', market.title);
  };

  const queryClient = new QueryClient()

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <div className={styles.page}>
          <Navbar />
          
          <main className={styles.main}>
            <div className="container">
              <MarketGrid onMarketClick={handleMarketClick} />
            </div>
          </main>
          
          <Footer />
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
