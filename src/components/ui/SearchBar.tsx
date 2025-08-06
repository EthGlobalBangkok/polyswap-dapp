'use client';

import { useState, useRef, useCallback } from 'react';
import styles from './SearchBar.module.css';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  placeholder?: string;
  isLoading?: boolean;
}

const SearchBar = ({ onSearch, onClear, placeholder = "Search markets...", isLoading = false }: SearchBarProps) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch(query.trim());
    }
  }, [onSearch, query]);

  const handleClear = useCallback(() => {
    setQuery('');
    onClear();
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [onClear]);

  return (
    <div className={styles.searchContainer}>
      <div className={styles.searchInputWrapper}>
        <div className={styles.searchIcon}>
          🔍
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={styles.searchInput}
          disabled={isLoading}
        />
        {query && (
          <button
            onClick={handleClear}
            className={styles.clearButton}
            disabled={isLoading}
          >
            ✕
          </button>
        )}
        {isLoading && (
          <div className={styles.loadingSpinner}>
            <div className={styles.spinner}></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchBar; 