'use client';

import { useState, useEffect } from 'react';
import { apiService, ApiMarket } from '../../services/api';
import TokenSelector from './TokenSelector';
import TokenIcon from './TokenIcon';
import styles from './CreateOrderView.module.css';

// Types for the order form
interface OrderFormData {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  minBuyAmount: string;
  startDate: string;
  deadline: string;
  selectedOutcome: string;
  betPercentage: string;
}

interface Token {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

interface CreateOrderViewProps {
  marketId: string;
  onBack: () => void;
}

export default function CreateOrderView({ marketId, onBack }: CreateOrderViewProps) {
  const [market, setMarket] = useState<ApiMarket | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Token selector modals state
  const [showSellTokenSelector, setShowSellTokenSelector] = useState(false);
  const [showBuyTokenSelector, setShowBuyTokenSelector] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<OrderFormData>(() => {
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);
    
    // Format dates for datetime-local input
    const formatDateTimeLocal = (date: Date) => {
      return date.toISOString().slice(0, 16);
    };

    return {
      sellToken: 'USDC',
      buyToken: 'COW',
      sellAmount: '',
      minBuyAmount: '',
      startDate: formatDateTimeLocal(now),
      deadline: formatDateTimeLocal(nextWeek),
      selectedOutcome: '',
      betPercentage: '50',
    };
  });

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
        
        // Set default outcome for binary markets
        if (marketData.type === 'binary') {
          setFormData(prev => ({ ...prev, selectedOutcome: 'yes' }));
        }
      } catch (err) {
        console.error('Failed to fetch market:', err);
        setError('Failed to load market data');
      } finally {
        setIsLoading(false);
      }
    };

    const fetchTokens = async () => {
      try {
        setIsLoadingTokens(true);
        const response = await fetch('/api/tokens');
        const data = await response.json();
        
        if (data.success) {
          setTokens(data.tokens);
          
          // Set default tokens if available
          const usdc = data.tokens.find((t: Token) => t.symbol === 'USDC');
          const weth = data.tokens.find((t: Token) => t.symbol === 'WETH');
          
          if (usdc) {
            setFormData(prev => ({ ...prev, sellToken: usdc.symbol }));
          }
          if (weth) {
            setFormData(prev => ({ ...prev, buyToken: weth.symbol }));
          }
        } else {
          console.error('Failed to fetch tokens:', data.error);
        }
      } catch (err) {
        console.error('Failed to fetch tokens:', err);
      } finally {
        setIsLoadingTokens(false);
      }
    };

    fetchMarketData();
    fetchTokens();
  }, [marketId]);

  const handleInputChange = (field: keyof OrderFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Utility function to get token data by symbol
  const getTokenData = (symbol: string): Token | undefined => {
    return tokens.find(t => t.symbol === symbol);
  };

  // Token selection handlers
  const handleSellTokenSelect = (token: Token) => {
    setFormData(prev => ({ ...prev, sellToken: token.symbol }));
    setShowSellTokenSelector(false);
  };

  const handleBuyTokenSelect = (token: Token) => {
    setFormData(prev => ({ ...prev, buyToken: token.symbol }));
    setShowBuyTokenSelector(false);
  };

  const getSelectedSellToken = (): Token | undefined => {
    return getTokenData(formData.sellToken);
  };

  const getSelectedBuyToken = (): Token | undefined => {
    return getTokenData(formData.buyToken);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Get token data for smart contract interaction
    const sellTokenData = getTokenData(formData.sellToken);
    const buyTokenData = getTokenData(formData.buyToken);
    
    if (!sellTokenData || !buyTokenData) {
      console.error('Token data not found');
      return;
    }

    // Format amounts with proper decimals for smart contract
    const sellAmountFormatted = formatTokenAmount(formData.sellAmount, sellTokenData.decimals);
    const minBuyAmountFormatted = formatTokenAmount(formData.minBuyAmount, buyTokenData.decimals);
    
    // Create simplified order object with only essential data
    const orderData = {
      // Smart contract amounts (with decimals)
      sellAmount: sellAmountFormatted.toString(),
      minBuyAmount: minBuyAmountFormatted.toString(),
      
      // Order parameters
      outcome: formData.selectedOutcome,
      betPercentage: formData.betPercentage,
      startDate: formData.startDate,
      deadline: formData.deadline,
      
      // Token data with addresses and metadata for smart contract
      sellTokenData: {
        symbol: sellTokenData.symbol,
        name: sellTokenData.name,
        address: sellTokenData.address,
        decimals: sellTokenData.decimals,
        logoURI: sellTokenData.logoURI,
      },
      buyTokenData: {
        symbol: buyTokenData.symbol,
        name: buyTokenData.name,
        address: buyTokenData.address,
        decimals: buyTokenData.decimals,
        logoURI: buyTokenData.logoURI,
      },
      
      // Market context
      marketId,
      marketTitle: market?.title || '',
      
      // Timestamps for smart contract
      startTimestamp: new Date(formData.startDate).getTime(),
      deadlineTimestamp: new Date(formData.deadline).getTime(),
    };
    
    console.log('Order data with decimals:', orderData);
    // TODO: Implement order submission to smart contract
  };

  const calculateMinReceive = () => {
    // TODO: Implement logic to calculate minimum receive amount based on market conditions
    return '0'
  };

  // Utility functions for token calculations
  const formatTokenAmount = (amount: string, decimals: number): bigint => {
    if (!amount || amount === '0') return BigInt(0);
    const amountFloat = parseFloat(amount);
    return BigInt(Math.floor(amountFloat * Math.pow(10, decimals)));
  };

  const calculateTokenUsdValue = (amount: string, tokenSymbol: string): string => {
    // For now, return amount without USD conversion since we don't have price data
    // TODO: Integrate with a price API for real USD values
    if (!amount || amount === '0') return '0';
    return amount;
  };

  const calculateEstimatedValue = () => {
    return calculateTokenUsdValue(formData.minBuyAmount, formData.buyToken);
  };

  const calculateSellValue = () => {
    return calculateTokenUsdValue(formData.sellAmount, formData.sellToken);
  };

  const calculateDaysUntilDeadline = () => {
    if (!formData.deadline) return '';
    const deadline = new Date(formData.deadline);
    const now = new Date();
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `in ${diffDays} days`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      const remainingDays = diffDays % 7;
      if (weeks === 1) {
        return remainingDays === 0 ? 'in 1 week' : `in 1 week and ${remainingDays} day${remainingDays > 1 ? 's' : ''}`;
      }
      return remainingDays === 0 ? `in ${weeks} weeks` : `in ${weeks} weeks and ${remainingDays} day${remainingDays > 1 ? 's' : ''}`;
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      const remainingDays = diffDays % 30;
      if (months === 1) {
        return remainingDays === 0 ? 'in 1 month' : `in 1 month and ${remainingDays} day${remainingDays > 1 ? 's' : ''}`;
      }
      return remainingDays === 0 ? `in ${months} months` : `in ${months} months and ${remainingDays} day${remainingDays > 1 ? 's' : ''}`;
    }
    const years = Math.floor(diffDays / 365);
    return years === 1 ? 'in 1 year' : `in ${years} years`;
  };

  const formatDateWithDuration = (dateString: string) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    const formattedDate = date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
    const duration = calculateDaysUntilDeadline();
    return duration ? `${formattedDate} (${duration})` : formattedDate;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getOutcomeDisplay = () => {
    if (!formData.selectedOutcome) return 'Not selected';
    return formData.selectedOutcome.toUpperCase();
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={onBack} className={styles.backButton}>
          ← Back to Markets
        </button>
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
        <>
          {/* Market Info Section */}
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

          {/* Order Form */}
          <form className={styles.orderForm} onSubmit={handleSubmit}>
            <div className={styles.formHeader}>
              <h3>Create Your Conditional Order</h3>
              <p>This order will execute automatically when your prediction is correct</p>
            </div>

            {/* Swap Configuration */}
            <div className={styles.swapSection}>
              <h4 className={styles.sectionTitle}>Swap Configuration</h4>
              
              {/* Sell Token */}
              <div className={styles.tokenRow}>
                <div className={styles.tokenGroup}>
                  <label className={styles.label}>Sell</label>
                  <div className={styles.tokenInputContainer}>
                    <input
                      type="number"
                      placeholder="0"
                      value={formData.sellAmount}
                      onChange={(e) => handleInputChange('sellAmount', e.target.value)}
                      className={styles.amountInput}
                      min="0"
                      step="0.01"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSellTokenSelector(true)}
                      className={styles.tokenButton}
                      disabled={isLoadingTokens}
                    >
                      {isLoadingTokens ? (
                        'Loading...'
                      ) : (
                        <>
                          <div className={styles.tokenButtonContent}>
                            <TokenIcon
                              logoURI={getSelectedSellToken()?.logoURI}
                              symbol={formData.sellToken}
                              size="small"
                            />
                            <span className={styles.tokenButtonSymbol}>
                              {formData.sellToken}
                            </span>
                          </div>
                          <span className={styles.tokenButtonArrow}>▼</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className={styles.tokenValue}>≈ {calculateSellValue()}</div>
                </div>
              </div>

              {/* Swap Arrow */}
              <div className={styles.swapArrow}>
                <div className={styles.arrowIcon}>↓</div>
              </div>

              {/* Buy Token */}
              <div className={styles.tokenRow}>
                <div className={styles.tokenGroup}>
                  <label className={styles.label}>Receive at least</label>
                  <div className={styles.tokenInputContainer}>
                    <input
                      type="number"
                      placeholder={calculateMinReceive()}
                      value={formData.minBuyAmount}
                      onChange={(e) => handleInputChange('minBuyAmount', e.target.value)}
                      className={styles.amountInput}
                      min="0"
                      step="0.01"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBuyTokenSelector(true)}
                      className={styles.tokenButton}
                      disabled={isLoadingTokens}
                    >
                      {isLoadingTokens ? (
                        'Loading...'
                      ) : (
                        <>
                          <div className={styles.tokenButtonContent}>
                            <TokenIcon
                              logoURI={getSelectedBuyToken()?.logoURI}
                              symbol={formData.buyToken}
                              size="small"
                            />
                            <span className={styles.tokenButtonSymbol}>
                              {formData.buyToken}
                            </span>
                          </div>
                          <span className={styles.tokenButtonArrow}>▼</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className={styles.tokenValue}>≈ {calculateEstimatedValue()}</div>
                </div>
              </div>
            </div>

            {/* Prediction Condition */}
            <div className={styles.conditionSection}>
              <h4 className={styles.sectionTitle}>When Prediction Comes True</h4>
              
              {/* Outcome Selection */}
              <div className={styles.outcomeSelection}>
                <label className={styles.label}>Select Outcome</label>
                {market.type === 'binary' ? (
                  <div className={styles.binaryOptions}>
                    <button
                      type="button"
                      className={`${styles.outcomeButton} ${formData.selectedOutcome === 'yes' ? styles.selected : ''}`}
                      onClick={() => handleInputChange('selectedOutcome', 'yes')}
                    >
                      <span className={styles.outcomeLabel}>YES</span>
                      <span className={styles.outcomeOdds}>{market.yesOdds}%</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.outcomeButton} ${formData.selectedOutcome === 'no' ? styles.selected : ''}`}
                      onClick={() => handleInputChange('selectedOutcome', 'no')}
                    >
                      <span className={styles.outcomeLabel}>NO</span>
                      <span className={styles.outcomeOdds}>{market.noOdds}%</span>
                    </button>
                  </div>
                ) : (
                  <select
                    value={formData.selectedOutcome}
                    onChange={(e) => handleInputChange('selectedOutcome', e.target.value)}
                    className={styles.outcomeSelect}
                  >
                    <option value="">Select an outcome</option>
                    {market.options?.map((option, index) => (
                      <option key={index} value={option.text}>
                        {option.text} ({option.odds}%)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Bet Percentage */}
              <div className={styles.percentageSection}>
                <label className={styles.activationLabel}>
                  Activation Condition: When {formData.selectedOutcome.toUpperCase()} reaches {formData.betPercentage}%
                </label>
                <div className={styles.percentageContainer}>
                  <input
                    type="range"
                    min="1"
                    max="99"
                    value={formData.betPercentage}
                    onChange={(e) => handleInputChange('betPercentage', e.target.value)}
                    className={styles.percentageSlider}
                  />
                  <div className={styles.percentageLabels}>
                    <span>1%</span>
                    <span>50%</span>
                    <span>99%</span>
                  </div>
                </div>
                <div className={styles.marketPrice}>
                  Market: {formData.selectedOutcome === 'yes' ? market.yesOdds : market.noOdds}%
                </div>
              </div>
            </div>

            {/* Order Timing */}
            <div className={styles.timingSection}>
              <h4 className={styles.sectionTitle}>Order Timing</h4>
              
              <div className={styles.dateRow}>
                <div className={styles.dateGroup}>
                  <label className={styles.label}>Start Date</label>
                  <input
                    type="datetime-local"
                    value={formData.startDate}
                    onChange={(e) => handleInputChange('startDate', e.target.value)}
                    className={styles.dateInput}
                  />
                </div>
                
                <div className={styles.dateGroup}>
                  <label className={styles.label}>Deadline</label>
                  <input
                    type="datetime-local"
                    value={formData.deadline}
                    onChange={(e) => handleInputChange('deadline', e.target.value)}
                    className={styles.dateInput}
                  />
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className={styles.orderSummary}>
              <div className={styles.summaryRow}>
                <span>Selected Outcome</span>
                <span>{getOutcomeDisplay()}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Activation Percentage</span>
                <span>{formData.betPercentage}%</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Start Date</span>
                <span>{formatDate(formData.startDate)}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Deadline</span>
                <span>{formatDateWithDuration(formData.deadline)}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Fee</span>
                <span className={styles.freeText}>FREE</span>
              </div>
            </div>

            {/* Submit Button */}
            <button type="submit" className={styles.submitButton}>
              Create Order
            </button>
          </form>
        </>
      ) : null}

      {/* Token Selectors */}
      <TokenSelector
        isOpen={showSellTokenSelector}
        onClose={() => setShowSellTokenSelector(false)}
        onSelect={handleSellTokenSelect}
        tokens={tokens}
        selectedToken={getSelectedSellToken()}
        title="Select a token to sell"
      />

      <TokenSelector
        isOpen={showBuyTokenSelector}
        onClose={() => setShowBuyTokenSelector(false)}
        onSelect={handleBuyTokenSelect}
        tokens={tokens}
        selectedToken={getSelectedBuyToken()}
        title="Select a token to receive"
      />
    </div>
  );
}
