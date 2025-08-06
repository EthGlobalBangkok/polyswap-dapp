'use client';

import { MarketCardProps } from '../../types/market';
import styles from './MarketCard.module.css';

const MarketCard = ({ market, onClick }: MarketCardProps) => {
  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `$${(volume / 1000000).toFixed(1)}M`;
    } else if (volume >= 1000) {
      return `$${(volume / 1000).toFixed(1)}K`;
    }
    return `$${volume}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleClick = () => {
    if (onClick) {
      onClick(market);
    }
  };

  const renderBinaryOdds = () => (
    <div className={styles.oddsContainer}>
      <div className={styles.oddsOption}>
        <span className={styles.oddsLabel}>YES</span>
        <span className={`${styles.oddsValue} ${styles.yes}`}>
          {market.yesOdds}%
        </span>
      </div>
      <div className={styles.oddsOption}>
        <span className={styles.oddsLabel}>NO</span>
        <span className={`${styles.oddsValue} ${styles.no}`}>
          {market.noOdds}%
        </span>
      </div>
    </div>
  );

  const renderMultiChoiceOdds = () => (
    <div className={styles.multiChoiceContainer}>
      {market.options?.slice(0, 3).map((option) => (
        <div key={option.id} className={styles.multiChoiceOption}>
          <div className={styles.optionInfo}>
            <span className={styles.optionLabel}>{option.label}</span>
            <span 
              className={styles.optionOdds}
              style={{ color: option.color || 'var(--text-primary)' }}
            >
              {option.odds}%
            </span>
          </div>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill}
              style={{ 
                width: `${option.odds}%`,
                backgroundColor: option.color || 'var(--accent-primary)'
              }}
            />
          </div>
        </div>
      ))}
      {market.options && market.options.length > 3 && (
        <div className={styles.moreOptions}>
          +{market.options.length - 3} more options
        </div>
      )}
    </div>
  );

  return (
    <div 
      className={`${styles.marketCard} ${!market.isActive ? styles.inactive : ''}`}
      onClick={handleClick}
    >
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.category}>{market.category}</span>
        <span className={styles.volume}>{formatVolume(market.volume)}</span>
      </div>

      {/* Title */}
      <h3 className={styles.title}>{market.title}</h3>

      {/* Description */}
      <p className={styles.description}>{market.description}</p>

      {/* Odds Section - Different rendering based on market type */}
      {market.type === 'binary' ? renderBinaryOdds() : renderMultiChoiceOdds()}

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.endDate}>Ends {formatDate(market.endDate)}</span>
        <div className={styles.status}>
          <div className={`${styles.statusDot} ${market.isActive ? styles.active : styles.inactive}`}></div>
          <span className={styles.statusText}>
            {market.isActive ? 'Active' : 'Resolved'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MarketCard; 