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

  // Date utility functions
  const formatDateTimeLocal = (date: Date) => {
    // Format date for datetime-local input using local timezone
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const getMinDateTime = () => {
    const now = new Date();
    // Subtract 1 minute to allow for current time selection
    now.setMinutes(now.getMinutes() - 1);
    return formatDateTimeLocal(now);
  };

  const getCurrentDateTime = () => {
    return formatDateTimeLocal(new Date());
  };
  
  // Form state
  const [formData, setFormData] = useState<OrderFormData>(() => {
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);
    
    // Use the local formatDateTimeLocal function
    const formatLocal = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    return {
      sellToken: 'USDC',
      buyToken: 'COW',
      sellAmount: '',
      minBuyAmount: '',
      startDate: formatLocal(now), // Default to "now"
      deadline: formatLocal(nextWeek),
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

  // Special handlers for date changes with validation
  const handleStartDateChange = (value: string) => {
    const newStartDate = new Date(value);
    const currentDeadline = new Date(formData.deadline);
    
    // If new start date is after current deadline, adjust deadline
    if (newStartDate >= currentDeadline) {
      const newDeadline = new Date(newStartDate);
      newDeadline.setHours(newDeadline.getHours() + 1); // Add 1 hour minimum
      setFormData(prev => ({
        ...prev,
        startDate: value,
        deadline: formatDateTimeLocal(newDeadline)
      }));
    } else {
      setFormData(prev => ({ ...prev, startDate: value }));
    }
  };

  const handleDeadlineChange = (value: string) => {
    setFormData(prev => ({ ...prev, deadline: value }));
  };

  const setStartDateToNow = () => {
    const now = new Date();
    const currentDeadline = new Date(formData.deadline);
    
    // If current deadline is in the past or too close to now, adjust it
    if (currentDeadline <= now) {
      const newDeadline = new Date(now);
      newDeadline.setHours(newDeadline.getHours() + 1);
      setFormData(prev => ({
        ...prev,
        startDate: formatDateTimeLocal(now),
        deadline: formatDateTimeLocal(newDeadline)
      }));
    } else {
      setFormData(prev => ({ ...prev, startDate: formatDateTimeLocal(now) }));
    }
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

  // Form validation
  const isFormValid = (): boolean => {
    // Check if all required fields are filled
    const hasValidTokens = formData.sellToken && formData.buyToken && formData.sellToken !== formData.buyToken;
    const hasValidAmounts = formData.sellAmount && parseFloat(formData.sellAmount) > 0 && 
                           formData.minBuyAmount && parseFloat(formData.minBuyAmount) > 0;
    const hasValidOutcome = formData.selectedOutcome;
    const hasValidPercentage = formData.betPercentage && 
                              parseFloat(formData.betPercentage) > 0 && 
                              parseFloat(formData.betPercentage) <= 100;
    const hasValidDates = formData.startDate && formData.deadline && 
                         new Date(formData.deadline) > new Date(formData.startDate) &&
                         new Date(formData.startDate) >= new Date(Date.now() - 60000); // Allow 1 minute tolerance

    return !!(hasValidTokens && hasValidAmounts && hasValidOutcome && hasValidPercentage && hasValidDates);
  };

  // Get validation errors for display
  const getValidationErrors = (): string[] => {
    const errors: string[] = [];
    
    if (!formData.sellToken || !formData.buyToken) {
      errors.push('Please select both tokens');
    } else if (formData.sellToken === formData.buyToken) {
      errors.push('Sell and buy tokens must be different');
    }
    
    if (!formData.sellAmount || parseFloat(formData.sellAmount) <= 0) {
      errors.push('Please enter a valid sell amount');
    }
    
    if (!formData.minBuyAmount || parseFloat(formData.minBuyAmount) <= 0) {
      errors.push('Please enter a valid minimum buy amount');
    }
    
    if (!formData.selectedOutcome) {
      errors.push('Please select an outcome');
    }
    
    if (!formData.betPercentage || parseFloat(formData.betPercentage) <= 0 || parseFloat(formData.betPercentage) > 100) {
      errors.push('Please enter a valid percentage (1-100)');
    }
    
    if (!formData.startDate || !formData.deadline) {
      errors.push('Please set both start date and deadline');
    } else {
      const startDate = new Date(formData.startDate);
      const deadline = new Date(formData.deadline);
      const now = new Date();
      
      // Allow a tolerance of 1 minute for "now" selection
      const nowMinusOneMinute = new Date(now.getTime() - 60000); // 1 minute ago
      
      if (startDate < nowMinusOneMinute) {
        errors.push('Start date must be in the future');
      }
      
      if (deadline <= startDate) {
        errors.push('Deadline must be after start date');
      }
    }
    
    return errors;
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
            {market.slug && (
              <div className={styles.polymarketLink}>
                <a
                  href={`https://polymarket.com/event/${market.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.polymarketButton}
                >
                  🔗 See on Polymarket
                </a>
              </div>
            )}
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
                  <div className={styles.dateInputContainer}>
                    <input
                      type="datetime-local"
                      value={formData.startDate}
                      min={getMinDateTime()}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className={styles.dateInput}
                    />
                    <button
                      type="button"
                      onClick={setStartDateToNow}
                      className={styles.nowButton}
                      title="Set to current time"
                    >
                      Now
                    </button>
                  </div>
                </div>
                
                <div className={styles.dateGroup}>
                  <label className={styles.label}>Deadline</label>
                  <input
                    type="datetime-local"
                    value={formData.deadline}
                    min={formData.startDate || getMinDateTime()}
                    onChange={(e) => handleDeadlineChange(e.target.value)}
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

            {/* Validation Errors */}
            {!isFormValid() && (
              <div className={styles.validationErrors}>
                <h4>Please complete the following:</h4>
                <ul>
                  {getValidationErrors().map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Submit Button */}
            <button 
              type="submit" 
              className={`${styles.submitButton} ${!isFormValid() ? styles.submitButtonDisabled : ''}`}
              disabled={!isFormValid()}
              title={!isFormValid() ? 'Please complete all required fields' : 'Create your conditional swap order'}
            >
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
