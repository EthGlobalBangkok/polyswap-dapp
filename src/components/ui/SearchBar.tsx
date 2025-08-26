'use client';

import React, { useState, useRef, useCallback } from 'react';
import styles from './SearchBar.module.css';

interface SearchBarProps {
  onSearch: (query: string, category?: string, isSlug?: boolean) => void;
  onClear: () => void;
  placeholder?: string;
  isLoading?: boolean;
}

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'politics', label: 'Politics' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'economics', label: 'Economics' },
  { value: 'sports', label: 'Sports' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'world', label: 'World' },
  { value: 'technology', label: 'Technology' },
  { value: 'other', label: 'Other' },
];

const SearchBar = ({ onSearch, onClear, placeholder = "Search markets...", isLoading = false }: SearchBarProps) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [isSlug, setIsSlug] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Function to detect if input is a slug
  const detectSlug = useCallback((input: string): boolean => {
    const trimmed = input.trim();
    // Slug pattern: lowercase, hyphens, no spaces, no special chars except hyphens
    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    return slugPattern.test(trimmed) && trimmed.length > 0;
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setIsSlug(detectSlug(value));
  }, [detectSlug]);

  const handleCategoryChange = useCallback((category: string) => {
    setSelectedCategory(category);
    setShowCategoryDropdown(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch(query.trim(), selectedCategory || undefined, isSlug);
    }
  }, [onSearch, query, selectedCategory, isSlug]);

  const handleClear = useCallback(() => {
    setQuery('');
    setSelectedCategory('');
    onClear();
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [onClear]);

  const handleSearch = useCallback(() => {
    onSearch(query.trim(), selectedCategory || undefined, isSlug);
  }, [onSearch, query, selectedCategory, isSlug]);

  // Close dropdown when clicking outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setShowCategoryDropdown(false);
    }
  }, []);

  // Add/remove event listener
  React.useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleClickOutside]);

  const selectedCategoryLabel = CATEGORIES.find(cat => cat.value === selectedCategory)?.label || 'All Categories';

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
        

        
        {/* Category Filter Button */}
        <button
          type="button"
          onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
          className={styles.categoryButton}
          disabled={isLoading}
        >
          <span className={styles.categoryLabel}>{selectedCategoryLabel}</span>
          <span className={styles.categoryArrow}>▼</span>
        </button>

        {/* Category Dropdown */}
        {showCategoryDropdown && (
          <div ref={dropdownRef} className={styles.categoryDropdown}>
            {CATEGORIES.map((category) => (
              <button
                key={category.value}
                type="button"
                onClick={() => handleCategoryChange(category.value)}
                className={`${styles.categoryOption} ${selectedCategory === category.value ? styles.selected : ''}`}
              >
                {category.label}
              </button>
            ))}
          </div>
        )}

        {/* Search Button */}
        <button
          onClick={handleSearch}
          className={styles.searchButton}
          disabled={isLoading || (!query.trim() && !selectedCategory)}
        >
          Search
        </button>

        {/* Clear Button */}
        {(query || selectedCategory) && (
          <button
            onClick={handleClear}
            className={styles.clearButton}
            disabled={isLoading}
          >
            ✕
          </button>
        )}

        {/* Loading Spinner */}
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