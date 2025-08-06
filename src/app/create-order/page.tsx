'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import { apiService, ApiMarket } from '../../services/api';
import styles from './page.module.css';

export default function CreateOrderPage() {
  const searchParams = useSearchParams();
  const marketId = searchParams.get('marketId');
  const [market, setMarket] = useState<ApiMarket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarketData = async () => {
      if (!marketId) {
        setError('No market ID provided');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const marketData = await apiService.getMarketById(marketId);
        setMarket(marketData);
      } catch (err) {
        console.error('Failed to fetch market:', err);
        setError('Failed to load market data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarketData();
  }, [marketId]);

  return (
    <div className={styles.page}>
      <Navbar />
      
      <main className={styles.main}>
        <div className="container">
          <div className={styles.content}>
            <div className={styles.header}>
              <h1 className={styles.title}>Create Conditional Swap</h1>
              <p className={styles.subtitle}>
                Set up an automated swap that executes when your prediction comes true
              </p>
            </div>
            
            {isLoading ? (
              <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <p>Loading market data...</p>
              </div>
            ) : error ? (
              <div className={styles.error}>
                <p>{error}</p>
              </div>
            ) : market ? (
              <div className={styles.marketInfo}>
                <div className={styles.marketHeader}>
                  <span className={styles.category}>{market.category}</span>
                  <span className={styles.volume}>${(market.volume / 1000000).toFixed(1)}M</span>
                </div>
                <h2 className={styles.marketTitle}>{market.title}</h2>
                <p className={styles.marketDescription}>
                  {market.description}
                </p>
                <div className={styles.marketDetails}>
                  <span className={styles.endDate}>Ends {new Date(market.endDate).toLocaleDateString()}</span>
                  <span className={styles.type}>{market.type === 'binary' ? 'Binary' : 'Multi-Choice'}</span>
                </div>
              </div>
            ) : null}
            
            <div className={styles.orderForm}>
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>⚡</div>
                <h2 className={styles.emptyTitle}>Order Creation Coming Soon</h2>
                <p className={styles.emptyDescription}>
                  The conditional order creation interface will be implemented here.
                  You'll be able to specify the tokens to swap and the conditions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
} 