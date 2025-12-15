'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Market } from '../../types/market';
import { ApiMarket, apiService, SearchResult } from '../../services/api';
import MarketCard from './MarketCard';
import SearchBar from './SearchBar';
import styles from './MarketGrid.module.css';

const MarketGrid = () => {
  const router = useRouter();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');
  const [currentCategory, setCurrentCategory] = useState<string | undefined>();

  // Convert API market to internal market format - memoized
  const convertApiMarket = useCallback((apiMarket: ApiMarket): Market => {
    return {
      id: apiMarket.id,
      title: apiMarket.title,
      description: apiMarket.description || '',
      volume: apiMarket.volume,
      endDate: apiMarket.endDate,
      category: apiMarket.category,
      isActive: true, // All markets from API are active
      type: apiMarket.type,
      yesOdds: apiMarket.yesOdds,
      noOdds: apiMarket.noOdds,
      options: apiMarket.options?.map(option => ({
        id: option.text.toLowerCase().replace(/\s+/g, '-'),
        label: option.text,
        odds: option.odds
      })),
      slug: apiMarket.slug,
      clobTokenIds: apiMarket.clobTokenIds,
      conditionId: apiMarket.conditionId,
    };
  }, []);

  // Load top markets on component mount
  const loadTopMarkets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSearchActive(false);
      setCurrentPage(1);
      setCurrentQuery('');
      setCurrentCategory(undefined);
      
      const apiMarkets = await apiService.getTopMarkets();
      const convertedMarkets = apiMarkets.map(convertApiMarket);
      setMarkets(convertedMarkets);
      setTotalResults(convertedMarkets.length);
      setHasMore(false); // Top markets don't have pagination
    } catch (err) {
      console.error('Failed to load top markets:', err);
      setError('Failed to load markets. Please check your connection and try again.');
      setMarkets([]);
      setTotalResults(0);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [convertApiMarket]);

  useEffect(() => {
    loadTopMarkets();
  }, [loadTopMarkets]);

  // Handle search (only on Enter)
  const handleSearch = useCallback(async (query: string, category?: string, isSlug?: boolean, page: number = 1) => {
    if (!query.trim() && !category) {
      loadTopMarkets();
      return;
    }
    try {
      setIsSearching(true);
      setError(null);
      setSearchActive(true);
      setCurrentPage(page);
      setCurrentQuery(query);
      setCurrentCategory(category);
      
      let searchResult: SearchResult;
      
      if (isSlug) {
        // For slug searches, try to get the market directly by slug
        const market = await apiService.getMarketBySlug(query);
        if (market) {
          const convertedMarket = convertApiMarket(market);
          setMarkets([convertedMarket]);
          setTotalResults(1);
          setHasMore(false);
          setIsSearching(false);
          return;
        }
        // If not found, silently fall back to regular search
      }
      
      // Regular search (keywords, category, etc.)
      searchResult = await apiService.searchMarkets({ 
        q: query, 
        category: category,
        page: page,
        limit: 100
      });
      
      const convertedMarkets = searchResult.markets.map(convertApiMarket);
      setMarkets(convertedMarkets);
      setTotalResults(convertedMarkets.length);
      setHasMore(searchResult.pagination.hasMore);
    } catch (err) {
      console.error('Search failed:', err);
      setError('Search failed. Please try again or check your connection.');
      setMarkets([]);
      setTotalResults(0);
      setHasMore(false);
    } finally {
      setIsSearching(false);
    }
  }, [convertApiMarket, loadTopMarkets]);

  // Handle clear (reset to top markets)
  const handleClear = useCallback(() => {
    loadTopMarkets();
  }, [loadTopMarkets]);

  // Handle pagination
  const handleNextPage = useCallback(() => {
    if (hasMore) {
      const nextPage = currentPage + 1;
      if (searchActive) {
        handleSearch(currentQuery, currentCategory, false, nextPage);
      }
      // Top markets don't have pagination, so no need to handle loadTopMarkets
    }
  }, [hasMore, currentPage, searchActive, currentQuery, currentCategory, handleSearch]);

  const handlePrevPage = useCallback(() => {
    if (currentPage > 1) {
      const prevPage = currentPage - 1;
      if (searchActive) {
        handleSearch(currentQuery, currentCategory, false, prevPage);
      }
      // Top markets don't have pagination, so no need to handle loadTopMarkets
    }
  }, [currentPage, searchActive, currentQuery, currentCategory, handleSearch]);

  const handleMarketClick = useCallback((market: Market) => {
    router.push(`/create/${market.id}`);
  }, [router]);

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

  // Memoize the pagination controls
  const paginationControls = useMemo(() => {
    if (markets.length === 0 || isLoading || !searchActive) return null;
    
    return (
      <div className={styles.pagination}>
        <div className={styles.paginationInfo}>
          <span>Page {currentPage}</span>
          {totalResults > 0 && (
            <span>• {totalResults} results</span>
          )}
        </div>
        <div className={styles.paginationButtons}>
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || isLoading}
            className={styles.paginationButton}
          >
            ← Previous
          </button>
          <button
            onClick={handleNextPage}
            disabled={!hasMore || isLoading}
            className={styles.paginationButton}
          >
            Next →
          </button>
        </div>
      </div>
    );
  }, [markets.length, isLoading, currentPage, totalResults, hasMore, searchActive, handlePrevPage, handleNextPage]);

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
      <>
        <div className={styles.grid}>
          {markets.map((market) => (
            <MarketCard
              key={market.id}
              market={market}
              onClick={() => handleMarketClick(market)}
            />
          ))}
        </div>
        {paginationControls}
      </>
    );
  }, [isLoading, markets, error, handleMarketClick, paginationControls]);

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