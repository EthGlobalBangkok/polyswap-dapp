'use client';

import { useState, useMemo } from 'react';
import TokenIcon from './TokenIcon';
import styles from './TokenSelector.module.css';

interface Token {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

interface TokenSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: Token) => void;
  tokens: Token[];
  selectedToken?: Token;
  title: string;
}

export default function TokenSelector({
  isOpen,
  onClose,
  onSelect,
  tokens,
  selectedToken,
  title
}: TokenSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Popular tokens that should appear at the top
  const popularSymbols = ['USDC', 'WETH', 'DAI', 'WBTC', 'WMATIC', 'WPOL'];
  
  const { popularTokens, otherTokens } = useMemo(() => {
    const filtered = tokens.filter(token =>
      token.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.address.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const popular = filtered.filter(token => 
      popularSymbols.includes(token.symbol)
    ).sort((a, b) => {
      const aIndex = popularSymbols.indexOf(a.symbol);
      const bIndex = popularSymbols.indexOf(b.symbol);
      return aIndex - bIndex;
    });

    const other = filtered.filter(token => 
      !popularSymbols.includes(token.symbol)
    ).sort((a, b) => a.symbol.localeCompare(b.symbol));

    return { popularTokens: popular, otherTokens: other };
  }, [tokens, searchTerm]);

  const handleTokenSelect = (token: Token) => {
    onSelect(token);
    onClose();
    setSearchTerm('');
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>{title}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.searchContainer}>
          <input
            type="text"
            placeholder="Search name or paste address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        {!searchTerm && popularTokens.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Favorite tokens</h3>
            <div className={styles.favoriteTokens}>
              {popularTokens.slice(0, 4).map((token) => (
                <button
                  key={token.address}
                  className={`${styles.favoriteToken} ${
                    selectedToken?.address === token.address ? styles.selected : ''
                  }`}
                  onClick={() => handleTokenSelect(token)}
                >
                  <TokenIcon
                    logoURI={token.logoURI}
                    symbol={token.symbol}
                    size="medium"
                    className={styles.tokenIconWrapper}
                  />
                  <span>{token.symbol}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.tokenList}>
          {popularTokens.length > 0 && !searchTerm && (
            <>
              {popularTokens.slice(4).map((token) => (
                <div
                  key={token.address}
                  className={`${styles.tokenItem} ${
                    selectedToken?.address === token.address ? styles.selected : ''
                  }`}
                  onClick={() => handleTokenSelect(token)}
                >
                  <div className={styles.tokenInfo}>
                    <TokenIcon
                      logoURI={token.logoURI}
                      symbol={token.symbol}
                      size="medium"
                    />
                    <div className={styles.tokenDetails}>
                      <div className={styles.tokenSymbol}>{token.symbol}</div>
                      <div className={styles.tokenName}>{token.name}</div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {otherTokens.map((token) => (
            <div
              key={token.address}
              className={`${styles.tokenItem} ${
                selectedToken?.address === token.address ? styles.selected : ''
              }`}
              onClick={() => handleTokenSelect(token)}
            >
              <div className={styles.tokenInfo}>
                <TokenIcon
                  logoURI={token.logoURI}
                  symbol={token.symbol}
                  size="medium"
                />
                <div className={styles.tokenDetails}>
                  <div className={styles.tokenSymbol}>{token.symbol}</div>
                  <div className={styles.tokenName}>{token.name}</div>
                </div>
              </div>
              <div className={styles.tokenAddress}>
                {token.address.slice(0, 6)}...{token.address.slice(-4)}
              </div>
            </div>
          ))}

          {popularTokens.length + otherTokens.length === 0 && (
            <div className={styles.noResults}>
              No tokens found for "{searchTerm}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
