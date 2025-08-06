'use client';

import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import MarketGrid from '../components/ui/MarketGrid';
import { Market } from '../types/market';
import styles from './page.module.css';

export default function Home() {
  const handleMarketClick = (market: Market) => {
    // TODO: Navigate to conditional order creation page
    console.log('Creating conditional order for market:', market.title);
  };

  return (
    <div className={styles.page}>
      <Navbar />
      
      <main className={styles.main}>
        <div className="container">
          <MarketGrid onMarketClick={handleMarketClick} />
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
