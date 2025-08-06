'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Market } from '../../types/market';
import { ApiMarket, apiService } from '../../services/api';
import MarketCard from './MarketCard';
import SearchBar from './SearchBar';
import styles from './MarketGrid.module.css';

interface MarketGridProps {
  onMarketClick?: (market: Market) => void;
}

const MarketGrid = ({ onMarketClick }: MarketGridProps) => {
  const router = useRouter();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);

  // Convert API market to internal market format - memoized
  const convertApiMarket = useCallback((apiMarket: ApiMarket): Market => {
    return {
      id: apiMarket.id,
      title: apiMarket.title,
      description: apiMarket.description,
      volume: apiMarket.volume,
      endDate: apiMarket.endDate,
      category: apiMarket.category,
      isActive: apiMarket.isActive,
      type: apiMarket.type,
      yesOdds: apiMarket.yesOdds,
      noOdds: apiMarket.noOdds,
      options: apiMarket.options,
    };
  }, []);

  // Load top markets on component mount
  const loadTopMarkets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSearchActive(false);
      const apiMarkets = await apiService.getTopMarkets();
      const convertedMarkets = apiMarkets.map(convertApiMarket);
      setMarkets(convertedMarkets);
    } catch (err) {
      console.error('Failed to load top markets:', err);
      setError('Failed to load markets. Please check your connection and try again.');
      setMarkets([]);
    } finally {
      setIsLoading(false);
    }
  }, [convertApiMarket]);

  useEffect(() => {
    loadTopMarkets();
  }, [loadTopMarkets]);

  // Handle search (only on Enter)
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      loadTopMarkets();
      return;
    }
    try {
      setIsSearching(true);
      setError(null);
      setSearchActive(true);
      const apiMarkets = await apiService.searchMarkets({ q: query });
      const convertedMarkets = apiMarkets.map(convertApiMarket);
      setMarkets(convertedMarkets);
    } catch (err) {
      console.error('Search failed:', err);
      setError('Search failed. Please try again or check your connection.');
      setMarkets([]);
    } finally {
      setIsSearching(false);
    }
  }, [convertApiMarket, loadTopMarkets]);

  // Handle clear (reset to top markets)
  const handleClear = useCallback(() => {
    loadTopMarkets();
  }, [loadTopMarkets]);

  const handleMarketClick = useCallback((market: Market) => {
    console.log('Market clicked:', market.title);
    
    // Navigate to create order page with only market ID
    router.push(`/create-order?marketId=${market.id}`);
    
    if (onMarketClick) {
      onMarketClick(market);
    }
  }, [router, onMarketClick]);

  // Memoize the SearchBar to prevent unnecessary re-renders
  const searchBar = useMemo(() => (
    <SearchBar 
      onSearch={handleSearch}
      onClear={handleClear}
      isLoading={isSearching}
      placeholder="Search markets by question or keywords..."
    />
  ), [handleSearch, handleClear, isSearching]);

  // Memoize the header to prevent re-renders
  const header = useMemo(() => (
    <div className={styles.header}>
      <h2 className={styles.title}>
        {searchActive ? 'Search Results' : 'Most Popular Markets'}
      </h2>
      <p className={styles.subtitle}>
        {searchActive
          ? 'Markets matching your search.'
          : 'Choose a market condition for your conditional swap'}
      </p>
    </div>
  ), [searchActive]);

  // Memoize the error display
  const errorDisplay = useMemo(() => {
    if (!error) return null;
    
    return (
      <div className={styles.error}>
        <p>{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className={styles.retryButton}
        >
          Retry
        </button>
      </div>
    );
  }, [error]);

  // Memoize the content area
  const contentArea = useMemo(() => {
    if (isLoading) {
      return (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading markets...</p>
        </div>
      );
    }
    
    if (markets.length === 0 && !error) {
      return (
        <div className={styles.empty}>
          <p>No markets found. Try adjusting your search.</p>
        </div>
      );
    }
    
    return (
      <div className={styles.grid}>
        {markets.map((market) => (
          <MarketCard
            key={market.id}
            market={market}
            onClick={handleMarketClick}
          />
        ))}
      </div>
    );
  }, [isLoading, markets, error, handleMarketClick]);

  return (
    <div className={styles.container}>
      {header}
      {searchBar}
      {errorDisplay}
      {contentArea}
    </div>
  );
};

export default MarketGrid; 