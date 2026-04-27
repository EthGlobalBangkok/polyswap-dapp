"use client";

import { MarketCardProps } from "../../types/market";
import styles from "./MarketCard.module.css";

const MarketCard = ({ market, onClick }: MarketCardProps) => {
  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `$${(volume / 1000000).toFixed(1)}M`;
    } else if (volume >= 1000) {
      return `$${(volume / 1000).toFixed(0)}K`;
    }
    return `$${volume}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return "Ended";
    } else if (diffDays === 0) {
      return "Ends today";
    } else if (diffDays === 1) {
      return "Ends tomorrow";
    } else if (diffDays < 7) {
      return `${diffDays} days left`;
    } else if (diffDays < 30) {
      return `${Math.ceil(diffDays / 7)} weeks left`;
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  const handleClick = () => {
    if (onClick) {
      onClick(market);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      politics: "#ef4444",
      crypto: "#f59e0b",
      economics: "#22c55e",
      world: "#3b82f6",
      technology: "#8b5cf6",
      sports: "#06b6d4",
      entertainment: "#ec4899",
    };
    return colors[category.toLowerCase()] || "var(--accent-primary)";
  };

  const renderBinaryOdds = () => (
    <div className={styles.oddsContainer}>
      <div className={styles.oddsRow}>
        <div className={`${styles.oddsOption} ${styles.yes}`}>
          <span className={styles.oddsLabel}>Yes</span>
          <span className={styles.oddsValue}>{market.yesOdds}%</span>
        </div>
        <div className={`${styles.oddsOption} ${styles.no}`}>
          <span className={styles.oddsLabel}>No</span>
          <span className={styles.oddsValue}>{market.noOdds}%</span>
        </div>
      </div>
      <div className={styles.oddsBar}>
        <div 
          className={styles.oddsBarFill} 
          style={{ width: `${market.yesOdds}%` }}
        />
      </div>
    </div>
  );

  const renderMultiChoiceOdds = () => (
    <div className={styles.multiChoiceContainer}>
      {market.options?.slice(0, 3).map((option) => (
        <div key={option.id} className={styles.multiChoiceOption}>
          <div className={styles.optionRow}>
            <span className={styles.optionLabel}>{option.label}</span>
            <span className={styles.optionOdds}>{option.odds}%</span>
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: `${option.odds}%`,
              }}
            />
          </div>
        </div>
      ))}
      {market.options && market.options.length > 3 && (
        <span className={styles.moreOptions}>+{market.options.length - 3} more</span>
      )}
    </div>
  );

  return (
    <div
      className={`${styles.marketCard} ${!market.isActive ? styles.inactive : ""}`}
      onClick={handleClick}
    >
      {/* Header */}
      <div className={styles.header}>
        <span 
          className={styles.category}
          style={{ 
            backgroundColor: `${getCategoryColor(market.category)}15`,
            color: getCategoryColor(market.category)
          }}
        >
          {market.category}
        </span>
        <span className={styles.volume}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2V22M17 5H9.5C8.57174 5 7.6815 5.36875 7.02513 6.02513C6.36875 6.6815 6 7.57174 6 8.5C6 9.42826 6.36875 10.3185 7.02513 10.9749C7.6815 11.6313 8.57174 12 9.5 12H14.5C15.4283 12 16.3185 12.3687 16.9749 13.0251C17.6313 13.6815 18 14.5717 18 15.5C18 16.4283 17.6313 17.3185 16.9749 17.9749C16.3185 18.6313 15.4283 19 14.5 19H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {formatVolume(market.volume)}
        </span>
      </div>

      {/* Title */}
      <h3 className={styles.title}>{market.title}</h3>

      {/* Odds Section */}
      {market.type === "binary" ? renderBinaryOdds() : renderMultiChoiceOdds()}

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.endDate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 6V12L16 14M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {formatDate(market.endDate)}
        </span>
        <button className={styles.createButton}>
          Create Swap
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default MarketCard;
