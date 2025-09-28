'use client';

import { useState } from 'react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import MarketGrid from '../components/ui/MarketGrid';
import CreateOrderView from '../components/ui/CreateOrderView';
import OrdersView from '../components/ui/OrdersView';
import { Market } from '../types/market';
import styles from './page.module.css';

import { WagmiProvider } from 'wagmi'
import { config } from '../wagmi/config'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Navigation states
type ViewState = 'markets' | 'create-order' | 'orders';

export default function Home() {
  const [currentView, setCurrentView] = useState<ViewState>('markets');
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);

  const handleMarketClick = (market: Market) => {
    console.log('Creating conditional order for market:', market.title);
    setSelectedMarketId(market.id);
    setCurrentView('create-order');
  };

  const handleOrdersClick = () => {
    setCurrentView('orders');
  };

  const handleBackToMarkets = () => {
    setCurrentView('markets');
    setSelectedMarketId(null);
  };

  const queryClient = new QueryClient()

  // Render the appropriate view based on current state
  const renderCurrentView = () => {
    switch (currentView) {
      case 'create-order':
        return selectedMarketId ? (
          <CreateOrderView 
            marketId={selectedMarketId} 
            onBack={handleBackToMarkets}
          />
        ) : null;
      
      case 'orders':
        return <OrdersView onBack={handleBackToMarkets} />;
      
      case 'markets':
      default:
        return <MarketGrid onMarketClick={handleMarketClick} />;
    }
  };

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <div className={styles.page}>
          <Navbar 
            onOrdersClick={handleOrdersClick}
            onLogoClick={handleBackToMarkets}
          />
          
          <main className={styles.main}>
            <div className="container">
              {renderCurrentView()}
            </div>
          </main>
          
          <Footer />
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
