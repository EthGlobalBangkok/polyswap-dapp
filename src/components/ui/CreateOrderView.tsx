'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { apiService, ApiMarket } from '../../services/api';
import TokenSelector from './TokenSelector';
import TokenIcon from './TokenIcon';
import OrderBroadcastPopup from './OrderBroadcastPopup/OrderBroadcastPopup';
import PriceChart from './PriceChart';
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
  triggerPrice: string; // New field for Price Trigger
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
  onBack?: () => void; // Optional now as we use Link
}

export default function CreateOrderView({ marketId }: CreateOrderViewProps) {
  const { address } = useAccount();
  const [market, setMarket] = useState<ApiMarket | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
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

  // Form state
  /* Form state */
  const [isStartNow, setIsStartNow] = useState(true);
  const [formData, setFormData] = useState<OrderFormData>({
    sellToken: 'DAI',
    buyToken: 'USDC',
    sellAmount: '',
    minBuyAmount: '',
    selectedOutcome: 'Yes',
    triggerPrice: '0.50',
    startDate: '', // Handled by isStartNow
    deadline: ''
  });

  // Initialize defaults
  useEffect(() => {
     // Default Deadline: 2 weeks from now
     const twoWeeks = new Date();
     twoWeeks.setDate(twoWeeks.getDate() + 14);
     setFormData(prev => ({ 
         ...prev, 
         deadline: twoWeeks.toISOString().slice(0, 16) 
     }));
  }, []);

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        setIsLoading(true);
        const marketData = await apiService.getMarketById(marketId);
        setMarket(marketData);
        
        // Default outcome
        if (marketData.type === 'binary' && marketData.yesOdds && marketData.noOdds) {
           setFormData(prev => ({ ...prev, selectedOutcome: 'Yes' }));
        } else if (marketData.options && marketData.options.length > 0) {
           setFormData(prev => ({ ...prev, selectedOutcome: marketData.options![0].text }));
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
          const usdc = data.tokens.find((t: Token) => t.symbol === 'USDC');
           // Keep USDC as default sell
          if (usdc) {
            setFormData(prev => ({ ...prev, sellToken: usdc.symbol }));
          }
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

  // Quote Effect (Simplified)
  useEffect(() => {
    if (!formData.sellAmount || !formData.sellToken || !formData.buyToken || !address || parseFloat(formData.sellAmount) <= 0) {
      setQuote(null);
      return;
    }
    
    const sellToken = tokens.find(t => t.symbol === formData.sellToken);
    const buyToken = tokens.find(t => t.symbol === formData.buyToken);
    
    if (!sellToken || !buyToken) return;

    const timeoutId = setTimeout(async () => {
        setIsLoadingQuote(true);
        try {
            const sellAmountWei = (BigInt(Math.floor(parseFloat(formData.sellAmount) * Math.pow(10, sellToken.decimals)))).toString();
            const result = await apiService.getQuote({
                sellToken: sellToken.address,
                buyToken: buyToken.address,
                sellAmount: sellAmountWei,
                userAddress: address,
                chainId: sellToken.chainId,
            });

            if (result.success && result.data) {
                setQuote(result.data);
                // Auto-fill buy val if empty
                if (!formData.minBuyAmount) {
                     const buyVal = (parseFloat(result.data.buyAmount) / Math.pow(10, buyToken.decimals)).toFixed(6);
                     setFormData(prev => ({...prev, minBuyAmount: buyVal}));
                }
            }
        } catch (e) { console.error(e); }
        finally { setIsLoadingQuote(false); }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.sellAmount, formData.sellToken, formData.buyToken, address, tokens, formData.minBuyAmount]);


  const handleSwapTokens = () => {
     setFormData(prev => ({
       ...prev,
       sellToken: prev.buyToken,
       buyToken: prev.sellToken,
       sellAmount: prev.minBuyAmount,
       minBuyAmount: prev.sellAmount
     }));
  };

  const handlePriceSelect = (price: number) => {
    setFormData(prev => ({ ...prev, triggerPrice: price.toFixed(3) }));
  };

  const handleInputChange = (field: keyof OrderFormData, value: string) => {
    // Probability Inversion Logic
    if (field === 'selectedOutcome' && value !== formData.selectedOutcome && formData.triggerPrice) {
       const currentPrice = parseFloat(formData.triggerPrice);
       if (!isNaN(currentPrice) && currentPrice > 0 && currentPrice < 1) {
          // Invert: 0.05 -> 0.95, etc.
          const invertedPrice = (1 - currentPrice).toFixed(3);
          setFormData(prev => ({ ...prev, [field]: value, triggerPrice: invertedPrice }));
          return;
       }
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const getTokenData = (symbol: string) => tokens.find(t => t.symbol === symbol);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !market || !formData.triggerPrice) return;

    const sellTokenData = getTokenData(formData.sellToken);
    const buyTokenData = getTokenData(formData.buyToken);
    if (!sellTokenData || !buyTokenData) return;
    
    // Simplified submission logic based on new fields
    // We map "triggerPrice" to "betPercentage" (0-100) or similar logic expected by backend
    // Assuming backend takes 0-1 range for probability if we want to be precise, 
    // OR we just send the raw price as "limitPrice" if supported.
    // For now we will map triggerPrice (0.00-1.00) to percentage (0-100) string
    const percentage = (parseFloat(formData.triggerPrice) * 100).toFixed(0);

    // Calculate timestamps
    let start = Math.floor(new Date(formData.startDate).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    
    if (isStartNow || !formData.startDate) {
        start = now; 
    }
    
    const end = Math.floor(new Date(formData.deadline).getTime() / 1000);
    
    if (!isStartNow && start < now) {
        setError('Start date cannot be in the past');
        return;
    }

    const sellAmountWei = BigInt(Math.floor(parseFloat(formData.sellAmount) * Math.pow(10, sellTokenData.decimals))).toString();
    const minBuyWei = BigInt(Math.floor(parseFloat(formData.minBuyAmount) * Math.pow(10, buyTokenData.decimals))).toString();

    const orderPayload = {
        sellToken: sellTokenData.address,
        buyToken: buyTokenData.address,
        sellAmount: sellAmountWei,
        minBuyAmount: minBuyWei,
        selectedOutcome: formData.selectedOutcome,
        // Backend expects percentage 0-100 usually
        betPercentage: percentage, 
        startDate: formData.startDate,
        deadline: formData.deadline,
        marketId: market.id,
        marketTitle: market.title,
        marketDescription: market.description || '',
        clobTokenId: market.clobTokenIds?.[0], // First token ID for simple charts
        owner: address,
        startTimestamp: start,
        deadlineTimestamp: end,
    };

    try {
        setIsLoading(true);
        const result = await apiService.createPolyswapOrder(orderPayload);
        if (result.success) {
            setOrderId(result.data.orderId);
            setShowBroadcastPopup(true);
        } else {
            setError(result.message || 'Failed');
        }
    } catch (e) {
        setError('Submission failed');
    } finally {
        setIsLoading(false);
    }
  };
  
  // Render Helpers
  const isYes = formData.selectedOutcome === 'Yes';
  
  const calculateSellValue = () => {
    if (!formData.sellAmount || !quote) return '$0.00';
    if (quote.sellTokenUsdPrice !== null && quote.sellTokenUsdPrice !== undefined) {
      const usdValue = parseFloat(formData.sellAmount) * quote.sellTokenUsdPrice;
      return `$${usdValue.toFixed(2)}`;
    }
    return '$0.00';
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

  const getSelectedSellToken = () => getTokenData(formData.sellToken);
  const getSelectedBuyToken = () => getTokenData(formData.buyToken);


  if (isLoading && !market) return <div className={styles.container}>Loading...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link href="/" className={styles.backButton}>← Back to Markets</Link>
        <h1 className={styles.title}>Create Conditional Order</h1>
        <p className={styles.subtitle}>Execute a swap based on Polymarket probability</p>
      </div>

      <div className={styles.contentGrid}>
        {/* Left Column: Form */}
        <form className={styles.formCard} onSubmit={handleSubmit}>
           <div className={styles.formHeader}>
             <h2 className={styles.formTitle}>Swap Configuration</h2>
             {address ? (
                <span className={styles.walletBadge}>Connected</span>
             ) : (
                <span className={styles.walletWarning}>Connect Wallet</span>
             )}
           </div>

           {/* Swap Configuration */}
           <div className={styles.swapSection}>
              {/* Sell Token Row */}
              <div className={styles.tokenRow}>
                <div className={styles.tokenRowHeader}>
                  <span>Sell</span>
                  <span className={styles.usdValue}>
                    {quote?.sellTokenUsdPrice ? `$${(quote.sellTokenUsdPrice * parseFloat(formData.sellAmount || '0')).toFixed(2)}` : '~'}
                  </span>
                </div>
                <div className={styles.tokenInputRow}>
                   <input 
                     type="number" 
                     className={styles.amountInput}
                     placeholder="0"
                     value={formData.sellAmount}
                     onChange={e => handleInputChange('sellAmount', e.target.value)} 
                   />
                   <button type="button" className={styles.tokenSelector} onClick={() => setShowSellTokenSelector(true)}>
                      <TokenIcon 
                        symbol={formData.sellToken} 
                        logoURI={getTokenData(formData.sellToken)?.logoURI}
                        size="small" 
                      />
                      <span>{formData.sellToken}</span>
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                   </button>
                </div>
              </div>
              
              {/* Arrow */}
              <div className={styles.arrowContainer}>
                 <div className={styles.arrowButton} onClick={handleSwapTokens} role="button" tabIndex={0}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 5V19M12 19L19 12M12 19L5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                 </div>
              </div>

              {/* Buy Token Row */}
              <div className={styles.tokenRow}>
                <div className={styles.tokenRowHeader}>
                  <span>Receive (Min)</span>
                  <span className={styles.usdValue}>
                     {quote?.buyTokenUsdPrice ? `$${(quote.buyTokenUsdPrice * parseFloat(formData.minBuyAmount || '0')).toFixed(2)}` : '~'}
                  </span>
                </div>
                <div className={styles.tokenInputRow}>
                   <input 
                     type="number" 
                     className={styles.amountInput} 
                     placeholder="0"
                     value={formData.minBuyAmount}
                     onChange={e => handleInputChange('minBuyAmount', e.target.value)} 
                   />
                   <button type="button" className={styles.tokenSelector} onClick={() => setShowBuyTokenSelector(true)}>
                      <TokenIcon 
                        symbol={formData.buyToken} 
                        logoURI={getTokenData(formData.buyToken)?.logoURI}
                        size="small" 
                      />
                      <span>{formData.buyToken}</span>
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                   </button>
                </div>
              </div>
           </div>

           {/* Outcome Selection */}
           <div className={styles.outcomeSection}>
              <label className={styles.label}>Trigger Condition :</label>
              <div className={styles.outcomeToggle}>
                 {['Yes', 'No'].map(outcome => (
                    <button
                      key={outcome}
                      type="button"
                      className={`${styles.outcomeButton} ${formData.selectedOutcome === outcome ? (outcome === 'Yes' ? styles.activeYes : styles.activeNo) : ''}`}
                      onClick={() => handleInputChange('selectedOutcome', outcome)}
                    >
                      {outcome} outcome
                    </button>
                 ))}
              </div>
           </div>

           {/* Time Configuration */}
          <div className={styles.dateRow}>
            <div className={styles.dateGroup}>
               <div className={styles.labelRow}>
                 <label>Start Date</label>
                 <div 
                   className={`${styles.toggleContainer} ${isStartNow ? styles.active : ''}`}
                   onClick={() => setIsStartNow(!isStartNow)}
                 >
                   <span className={styles.toggleLabel}>Now</span>
                   <div className={styles.toggleSwitch} />
                 </div>
               </div>
               {isStartNow ? (
                 <div className={styles.disabledInput}>
                    Starts immediately
                 </div>
               ) : (
                 <input
                   type="datetime-local"
                   value={formData.startDate}
                   onChange={e => handleInputChange('startDate', e.target.value)}
                 />
               )}
            </div>
            <div className={styles.dateGroup}>
               <label>Deadline</label>
               <input
                 type="datetime-local"
                 value={formData.deadline}
                 onChange={e => handleInputChange('deadline', e.target.value)}
                 min={isStartNow ? new Date().toISOString().slice(0, 16) : formData.startDate}
               />
            </div>
          </div>
           <button 
             type="submit" 
             className={styles.submitButton}
             disabled={isLoading || !formData.triggerPrice || !address}
            >
              {isLoading ? 'Creating Order...' : 'Create Order'}
           </button>
           
           {error && <div className={styles.error} style={{marginTop: '1rem', color: 'red'}}>{error}</div>}
        </form>

        {/* Right Column: Chart */}
        <div className={styles.infoColumn}>
           <div className={styles.marketCard}>
              <h2 className={styles.marketTitle}>{market?.title}</h2>
              <div className={styles.marketMeta}>
                 <div className={styles.metaLeft}>
                   <span className={styles.tag}>{market?.category}</span>
                   <span>Vol: ${((market?.volume || 0)/1000000).toFixed(1)}M</span>
                 </div>
                 {/* Polymarket Link */}
                 <a 
                   href={`https://polymarket.com/event/${market?.eventSlug || market?.slug}`} 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className={styles.polymarketLink}
                 >
                   View on Polymarket ↗
                 </a>
              </div>
              <p className={styles.marketDesc}>{market?.description}</p>
              
              <PriceChart 
                clobTokenId={market?.clobTokenIds?.[0]} 
                onPriceSelect={handlePriceSelect}
                selectedPrice={formData.triggerPrice ? parseFloat(formData.triggerPrice) : null}
                isYesOutcome={isYes}
              />
              
              <div className={styles.conditionCard}>
                 <div className={styles.conditionLabel}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                    Execution Condition
                 </div>
                 <div className={styles.conditionText}>
                    Execute order when 
                    <span className={`${styles.highlight} ${isYes ? styles.highlightYes : styles.highlightNo}`}>
                      {formData.selectedOutcome}
                    </span> 
                    probability is above 
                    <span className={styles.highlight}>
                      {formData.triggerPrice ? `${(parseFloat(formData.triggerPrice) * 100).toFixed(1)}%` : '...'}
                    </span>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {showBroadcastPopup && orderId && (
        <OrderBroadcastPopup 
          isOpen={showBroadcastPopup}
          orderId={orderId} 
          onClose={() => setShowBroadcastPopup(false)} 
        />
      )}
      
      {/* Token Selectors */}
      {showSellTokenSelector && (
        <TokenSelector 
           isOpen={showSellTokenSelector}
           title="Select Sell Token"
           onSelect={(t) => {
             setFormData(prev => ({...prev, sellToken: t.symbol}));
             setShowSellTokenSelector(false);
           }}
           onClose={() => setShowSellTokenSelector(false)}
           tokens={tokens}
           selectedToken={getTokenData(formData.sellToken)}
        />
      )}
      {showBuyTokenSelector && (
        <TokenSelector 
           isOpen={showBuyTokenSelector}
           title="Select Buy Token"
           onSelect={(t) => {
             setFormData(prev => ({...prev, buyToken: t.symbol}));
             setShowBuyTokenSelector(false);
           }}
           onClose={() => setShowBuyTokenSelector(false)}
           tokens={tokens}
           selectedToken={getTokenData(formData.buyToken)}
        />
      )}
    </div>
  );
}
