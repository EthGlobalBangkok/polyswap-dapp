'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { apiService, ApiMarket } from '../../services/api';
import TokenSelector from './TokenSelector';
import TokenIcon from './TokenIcon';
import OrderBroadcastPopup from './OrderBroadcastPopup/OrderBroadcastPopup';
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
  const { address } = useAccount();
  const [market, setMarket] = useState<ApiMarket | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null); // Changed from orderHash to orderId
  const [showBroadcastPopup, setShowBroadcastPopup] = useState(false);

  // Token selector modals state
  const [showSellTokenSelector, setShowSellTokenSelector] = useState(false);
  const [showBuyTokenSelector, setShowBuyTokenSelector] = useState(false);

  // Quote state
  const [quote, setQuote] = useState<{
    buyAmount: string;
    sellAmount: string;
    feeAmount: string;
    exchangeRate: string;
    sellTokenUsdPrice: number | null;
    buyTokenUsdPrice: number | null;
  } | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

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
      startDate: 'now', // Default to "now"
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
        setSuccessMessage(null);
        const marketData = await apiService.getMarketById(marketId);
        setMarket(marketData);
        
        // Set default outcome for binary markets
        if (marketData.type === 'binary') {
          // For traditional binary markets with yesOdds/noOdds
          if (marketData.yesOdds !== undefined && marketData.noOdds !== undefined) {
            setFormData(prev => ({ ...prev, selectedOutcome: 'Yes' }));
          }
          // For non-traditional binary markets with options
          else if (marketData.options && marketData.options.length >= 2) {
            setFormData(prev => ({ ...prev, selectedOutcome: marketData.options[0].text }));
          } else {
            // Handle case where options is undefined or empty
            setError('Market data error: Invalid binary market structure');
            return;
          }
        }
        // Set default outcome for multi-choice markets
        else if (marketData.type === 'multi-choice') {
          if (marketData.options && marketData.options.length > 0) {
            setFormData(prev => ({ ...prev, selectedOutcome: marketData.options[0].text }));
          } else {
            // Handle case where options is undefined or empty
            setError('Market data error: Invalid multi-choice market structure');
            return;
          }
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

  // Debounced quote fetching
  useEffect(() => {
    // Only fetch quote if we have all required data
    if (!formData.sellAmount || !formData.sellToken || !formData.buyToken || !address || parseFloat(formData.sellAmount) <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    const sellToken = tokens.find(t => t.symbol === formData.sellToken);
    const buyToken = tokens.find(t => t.symbol === formData.buyToken);

    if (!sellToken || !buyToken) {
      return;
    }

    // Debounce the quote fetching by 500ms
    const timeoutId = setTimeout(async () => {
      try {
        setIsLoadingQuote(true);
        setQuoteError(null);

        // Convert sell amount to wei
        const sellAmountWei = (BigInt(Math.floor(parseFloat(formData.sellAmount) * Math.pow(10, sellToken.decimals)))).toString();

        const result = await apiService.getQuote({
          sellToken: sellToken.address,
          buyToken: buyToken.address,
          sellAmount: sellAmountWei,
          userAddress: address,
          chainId: sellToken.chainId,
        });

        if (result.success && result.data) {

          const quoteData = {
            buyAmount: result.data.buyAmount,
            sellAmount: result.data.sellAmount,
            feeAmount: result.data.feeAmount,
            exchangeRate: result.data.exchangeRate,
            sellTokenUsdPrice: result.data.sellTokenUsdPrice,
            buyTokenUsdPrice: result.data.buyTokenUsdPrice,
          };

          setQuote(quoteData);

          // Auto-fill buy amount if not manually set
          const currentMinBuyAmount = formData.minBuyAmount;
          if (parseFloat(currentMinBuyAmount) === 0) {
            const buyAmountFormatted = (parseFloat(result.data.buyAmount) / Math.pow(10, buyToken.decimals)).toFixed(6);
            setFormData(prev => ({ ...prev, minBuyAmount: buyAmountFormatted }));
          }

          setQuoteError(null);
        } else {
          setQuoteError(result.message || 'Failed to fetch quote');
          setQuote(null);
        }
      } catch {
        setQuoteError('Failed to fetch quote');
        setQuote(null);
      } finally {
        setIsLoadingQuote(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.sellAmount, formData.sellToken, formData.buyToken, address, tokens]);

  const handleInputChange = (field: keyof OrderFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Special handlers for date changes with validation
  const handleStartDateChange = (value: string) => {
    // If value is empty, set to "now"
    if (!value) {
      setFormData(prev => ({ ...prev, startDate: 'now' }));
      return;
    }
    
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
        startDate: 'now',
        deadline: formatDateTimeLocal(newDeadline)
      }));
    } else {
      setFormData(prev => ({ ...prev, startDate: 'now' }));
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
    // Check if wallet is connected
    if (!address) return false;
    
    // Check if all required fields are filled
    const hasValidTokens = formData.sellToken && formData.buyToken && formData.sellToken !== formData.buyToken;
    const hasValidAmounts = formData.sellAmount && parseFloat(formData.sellAmount) > 0 && 
                           formData.minBuyAmount && parseFloat(formData.minBuyAmount) > 0;
    const hasValidOutcome = formData.selectedOutcome;
    const hasValidPercentage = formData.betPercentage && 
                              parseFloat(formData.betPercentage) > 0 && 
                              parseFloat(formData.betPercentage) <= 100;
    const hasValidDates = formData.startDate && formData.deadline && 
                         new Date(formData.deadline) > (formData.startDate === 'now' ? new Date() : new Date(formData.startDate)) &&
                         (formData.startDate === 'now' || new Date(formData.startDate) >= new Date(Date.now() - 60000)); // Allow 1 minute tolerance

    return !!(hasValidTokens && hasValidAmounts && hasValidOutcome && hasValidPercentage && hasValidDates);
  };

  // Get validation errors for display
  const getValidationErrors = (): string[] => {
    const errors: string[] = [];
    
    if (!address) {
      errors.push('Please connect your wallet to create an order');
    }
    
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
      
      if (formData.startDate !== 'now' && startDate < nowMinusOneMinute) {
        errors.push('Start date must be in the future');
      }
      
      if (deadline <= startDate) {
        errors.push('Deadline must be after start date');
      }
    }
    
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if wallet is connected
    if (!address) {
      setError('Please connect your wallet to create an order');
      return;
    }
    
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
    
    // Create order data for API submission
    const orderData = {
      // Token addresses
      sellToken: sellTokenData.address,
      buyToken: buyTokenData.address,
      
      // Amounts (as formatted strings for API)
      sellAmount: sellAmountFormatted.toString(),
      minBuyAmount: minBuyAmountFormatted.toString(),
      
      // Order parameters
      selectedOutcome: formData.selectedOutcome,
      betPercentage: formData.betPercentage,
      startDate: formData.startDate,
      deadline: formData.deadline,
      
      // Market context
      marketId,
      marketTitle: market?.title || '',
      marketDescription: market?.description || '',
      
      // CLOB token ID for Polymarket (from market data)
      clobTokenId: market?.clobTokenIds?.[0] || undefined, // Use first token ID for now
      
      // Owner (Safe address from connected wallet)
      owner: address,
      
      // Timestamps for smart contract
      startTimestamp: new Date(formData.startDate).getTime(),
      deadlineTimestamp: new Date(formData.deadline).getTime(),
    };
    
    try {
      // Show loading state
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);
      
      // Submit order to backend API using ApiService
      const result = await apiService.createPolyswapOrder(orderData);
      
      if (result.success) {
        // Order created successfully
        console.log('Order created successfully:', result.data);
        
        // Show the order broadcast popup
        const newOrderId = result.data.orderId;
        console.log('Setting order ID:', newOrderId);
        setOrderId(newOrderId); // Changed from orderHash to orderId
        setShowBroadcastPopup(true);
        setError(null);
        
        // Reset form
        setFormData({
          sellToken: 'USDC',
          buyToken: 'COW',
          sellAmount: '',
          minBuyAmount: '',
          startDate: 'now',
          deadline: formatDateTimeLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 1 week from now
          selectedOutcome: '',
          betPercentage: '50',
        });
      } else {
        // Handle API error
        setError(result.message || 'Failed to create order');
        setSuccessMessage(null);
        console.error('API error:', result.error);
      }
    } catch (error) {
      console.error('Failed to submit order:', error);
      setError('Failed to submit order. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateMinReceive = () => {
    if (quote && quote.buyAmount) {
      const buyToken = getTokenData(formData.buyToken);
      if (buyToken) {
        return (parseFloat(quote.buyAmount) / Math.pow(10, buyToken.decimals)).toFixed(6);
      }
    }
    return '0';
  };

  // Utility functions for token calculations
  const formatTokenAmount = (amount: string, decimals: number): bigint => {
    if (!amount || amount === '0') return BigInt(0);
    const amountFloat = parseFloat(amount);
    return BigInt(Math.floor(amountFloat * Math.pow(10, decimals)));
  };

  const calculateSellValue = () => {
    if (!formData.sellAmount || !quote) return '$0.00';

    // Use the sell token USD price from the quote
    if (quote.sellTokenUsdPrice !== null && quote.sellTokenUsdPrice !== undefined) {
      const usdValue = parseFloat(formData.sellAmount) * quote.sellTokenUsdPrice;
      return `$${usdValue.toFixed(2)}`;
    }

    return '$0.00';
  };

  const calculateEstimatedValue = () => {
    if (!formData.minBuyAmount || !quote) return '$0.00';

    // Use the buy token USD price from the quote
    if (quote.buyTokenUsdPrice !== null && quote.buyTokenUsdPrice !== undefined) {
      const usdValue = parseFloat(formData.minBuyAmount) * quote.buyTokenUsdPrice;
      return `$${usdValue.toFixed(2)}`;
    }

    return '$0.00';
  };

  const getExchangeRateDisplay = (): string => {
    if (!quote || !quote.buyAmount || !quote.sellAmount) return '';

    const sellToken = getTokenData(formData.sellToken);
    const buyToken = getTokenData(formData.buyToken);

    if (!sellToken || !buyToken) return '';

    // Convert wei amounts to human-readable amounts
    const buyAmountWei = parseFloat(quote.buyAmount);
    const sellAmountWei = parseFloat(quote.sellAmount);
    const buyAmountHuman = buyAmountWei / Math.pow(10, buyToken.decimals);
    const sellAmountHuman = sellAmountWei / Math.pow(10, sellToken.decimals);

    // Calculate human-readable exchange rate
    const humanRate = buyAmountHuman / sellAmountHuman;

    // Format with appropriate precision
    let formattedRate: string;
    if (humanRate < 0.000001) {
      formattedRate = humanRate.toExponential(6);
    } else if (humanRate < 0.01) {
      formattedRate = humanRate.toFixed(8);
    } else if (humanRate < 1) {
      formattedRate = humanRate.toFixed(6);
    } else if (humanRate < 1000) {
      formattedRate = humanRate.toFixed(4);
    } else {
      formattedRate = humanRate.toFixed(2);
    }

    return `1 ${sellToken.symbol} ≈ ${formattedRate} ${buyToken.symbol}`;
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
    if (dateString === 'now') return 'Now';
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
    return formData.selectedOutcome;
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
            {(market.eventSlug || market.slug) && (
              <div className={styles.polymarketLink}>
                <a
                  href={`https://polymarket.com/event/${market.eventSlug || market.slug}`}
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
              {!address && (
                <div className={styles.walletWarning}>
                  ⚠️ Please connect your wallet to create an order
                </div>
              )}
              {address && (
                <div className={styles.walletConnected}>
                  ✅ Wallet connected: {address.slice(0, 6)}...{address.slice(-4)}
                </div>
              )}
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
                  <div className={styles.tokenValue}>
                    {isLoadingQuote ? (
                      <span style={{ opacity: 0.6 }}>Loading...</span>
                    ) : (
                      calculateSellValue()
                    )}
                  </div>
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
                  <div className={styles.tokenValue}>
                    {isLoadingQuote ? (
                      <span style={{ opacity: 0.6 }}>Loading...</span>
                    ) : (
                      calculateEstimatedValue()
                    )}
                  </div>
                  {quote && getExchangeRateDisplay() && (
                    <div className={styles.exchangeRate} style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      {getExchangeRateDisplay()}
                    </div>
                  )}
                  {quoteError && (
                    <div style={{ fontSize: '12px', color: '#ff6b6b', marginTop: '4px' }}>
                      {quoteError}
                    </div>
                  )}
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
                  // Check if this is a traditional binary market with yesOdds/noOdds
                  market.yesOdds !== undefined && market.noOdds !== undefined ? (
                    <div className={styles.binaryOptions}>
                      <button
                        type="button"
                        className={`${styles.outcomeButton} ${formData.selectedOutcome === 'Yes' ? styles.selected : ''}`}
                        onClick={() => handleInputChange('selectedOutcome', 'Yes')}
                      >
                        <span className={styles.outcomeLabel}>YES</span>
                        <span className={styles.outcomeOdds}>{market.yesOdds}%</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.outcomeButton} ${formData.selectedOutcome === 'No' ? styles.selected : ''}`}
                        onClick={() => handleInputChange('selectedOutcome', 'No')}
                      >
                        <span className={styles.outcomeLabel}>NO</span>
                        <span className={styles.outcomeOdds}>{market.noOdds}%</span>
                      </button>
                    </div>
                  ) : market.options && market.options.length >= 2 ? (
                    // For non-traditional binary markets with options
                    <div className={styles.binaryOptions}>
                      {market.options.map((option, index) => (
                        <button
                          key={index}
                          type="button"
                          className={`${styles.outcomeButton} ${formData.selectedOutcome === option.text ? styles.selected : ''}`}
                          onClick={() => handleInputChange('selectedOutcome', option.text)}
                        >
                          <span className={styles.outcomeLabel}>{option.text.toUpperCase()}</span>
                          <span className={styles.outcomeOdds}>{option.odds}%</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    // Error state for binary markets with no valid options
                    <div className={styles.error}>
                      Market data error: Invalid binary market structure
                    </div>
                  )
                ) : market.options && market.options.length > 0 ? (
                  <select
                    value={formData.selectedOutcome}
                    onChange={(e) => handleInputChange('selectedOutcome', e.target.value)}
                    className={styles.outcomeSelect}
                  >
                    <option value="">Select an outcome</option>
                    {market.options.map((option, index) => (
                      <option key={index} value={option.text}>
                        {option.text} ({option.odds}%)
                      </option>
                    ))}
                  </select>
                ) : (
                  // Error state for multi-choice markets with no valid options
                  <div className={styles.error}>
                    Market data error: Invalid multi-choice market structure
                  </div>
                )}
              </div>

              {/* Bet Percentage */}
              <div className={styles.percentageSection}>
                <label className={styles.activationLabel}>
                  Activation Condition: When {formData.selectedOutcome || 'selected outcome'} reaches {formData.betPercentage}%
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
                  Market: {
                    market.type === 'binary' && market.yesOdds !== undefined && market.noOdds !== undefined
                      ? (formData.selectedOutcome === 'Yes' ? market.yesOdds : market.noOdds)
                      : market.options && market.options.length > 0 
                        ? market.options.find(option => option.text === formData.selectedOutcome)?.odds || 0
                        : 0
                  }%
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
                      value={formData.startDate === 'now' ? '' : formData.startDate}
                      min={getMinDateTime()}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className={styles.dateInput}
                      placeholder={formData.startDate === 'now' ? 'Now' : ''}
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

            {/* Success Message */}
            {successMessage && (
              <div className={styles.successMessage}>
                <h4>✅ Success!</h4>
                <p>{successMessage}</p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className={styles.errorMessage}>
                <h4>❌ Error</h4>
                <p>{error}</p>
              </div>
            )}

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
              className={`${styles.submitButton} ${!isFormValid() || isLoading ? styles.submitButtonDisabled : ''}`}
              disabled={!isFormValid() || isLoading}
              title={!isFormValid() ? 'Please complete all required fields' : isLoading ? 'Creating order...' : 'Create your conditional swap order'}
            >
              {isLoading ? (
                <>
                  <div className={styles.spinner}></div>
                  Creating Order...
                </>
              ) : (
                'Create Order'
              )}
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
      
      {orderId && (
        <div>
          <p>Debug: orderId = {orderId}, showBroadcastPopup = {showBroadcastPopup ? 'true' : 'false'}</p>
          <OrderBroadcastPopup
            isOpen={showBroadcastPopup}
            onClose={() => setShowBroadcastPopup(false)}
            orderId={orderId}
          />
        </div>
      )}
    </div>
  );
}
