"use client";

import React, { useState, useRef, useCallback } from "react";
import styles from "./SearchBar.module.css";

interface SearchBarProps {
  onSearch: (query: string, category?: string, isSlug?: boolean) => void;
  onClear: () => void;
  placeholder?: string;
  isLoading?: boolean;
}

// Crypto-relevant categories that impact markets
const CATEGORIES = [
  { value: "", label: "All", icon: "🌐" },
  { value: "politics", label: "Politics", icon: "🏛️" },
  { value: "crypto", label: "Crypto", icon: "₿" },
  { value: "economics", label: "Economy", icon: "📈" },
  { value: "world", label: "Geopolitics", icon: "🌍" },
  { value: "technology", label: "Tech", icon: "💻" },
  { value: "sports", label: "Sports", icon: "⚽" },
];

const SearchBar = ({
  onSearch,
  onClear,
  placeholder = "Search markets...",
  isLoading = false,
}: SearchBarProps) => {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [isSlug, setIsSlug] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Function to detect if input is a slug
  const detectSlug = useCallback((input: string): boolean => {
    const trimmed = input.trim();
    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    return slugPattern.test(trimmed) && trimmed.length > 0;
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      setIsSlug(detectSlug(value));
    },
    [detectSlug]
  );

  const handleCategoryClick = useCallback((category: string) => {
    setSelectedCategory(category);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        onSearch(query.trim(), selectedCategory || undefined, isSlug);
      }
    },
    [onSearch, query, selectedCategory, isSlug]
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setSelectedCategory("");
    onClear();
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [onClear]);

  const handleSearch = useCallback(() => {
    onSearch(query.trim(), selectedCategory || undefined, isSlug);
  }, [onSearch, query, selectedCategory, isSlug]);

  // Search when category changes
  React.useEffect(() => {
    if (selectedCategory) {
      onSearch(query.trim(), selectedCategory, isSlug);
    }
  }, [selectedCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.searchContainer}>
      {/* Search Input */}
      <div className={styles.searchInputWrapper}>
        <svg className={styles.searchIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
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
        
        {(query || selectedCategory) && (
          <button onClick={handleClear} className={styles.clearButton} disabled={isLoading}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        
        <button
          onClick={handleSearch}
          className={styles.searchButton}
          disabled={isLoading || (!query.trim() && !selectedCategory)}
        >
          {isLoading ? (
            <div className={styles.spinner}></div>
          ) : (
            "Search"
          )}
        </button>
      </div>

      {/* Category Pills */}
      <div className={styles.categoryPills}>
        {CATEGORIES.map((category) => (
          <button
            key={category.value}
            type="button"
            onClick={() => handleCategoryClick(category.value)}
            className={`${styles.categoryPill} ${selectedCategory === category.value ? styles.active : ""}`}
            disabled={isLoading}
          >
            <span className={styles.categoryIcon}>{category.icon}</span>
            <span>{category.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SearchBar;
