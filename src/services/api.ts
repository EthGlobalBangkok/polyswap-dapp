// API service for communicating with the backend
import { DatabasePolyswapOrder } from '../backend/interfaces/PolyswapOrder';

export interface BackendMarket {
  id: string;
  question: string;
  volume: string;
  end_date: string;
  outcomes: string[];
  outcome_prices: number[];
  category: string;
  condition_id?: string;
  slug: string;
  event_slug?: string | null; // Parent event slug for Polymarket links
  clob_token_ids: string[];
  description?: string;
}

export interface BackendApiResponse {
  success: boolean;
  data: BackendMarket[];
  count: number;
  message: string;
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface SearchParams {
  q?: string;
  type?: 'all' | 'any';
  category?: string;
  page?: number;
  limit?: number;
}

export interface SearchResult {
  markets: ApiMarket[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ApiMarket {
  id: string;
  title: string;
  volume: number;
  endDate: string;
  category: string;
  type: 'binary' | 'multi-choice';
  yesOdds?: number;
  noOdds?: number;
  options?: MarketOption[];
  conditionId?: string;
  slug: string;
  eventSlug?: string; // Parent event slug for Polymarket links
  clobTokenIds: string[];
  description?: string;
}

export interface MarketOption {
  text: string;
  odds: number;
}

class ApiService {
  private baseUrl = '/api'; // Use relative paths for Next.js API routes

  private async fetchApi(endpoint: string, params?: Record<string, string | number>): Promise<any> {
    // Build the full URL path
    const fullPath = `${this.baseUrl}${endpoint}`;
    
    // Create URL with search params
    const url = new URL(fullPath, window.location.origin);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Create a new polyswap order
  async createPolyswapOrder(orderData: {
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    minBuyAmount: string;
    selectedOutcome: string;
    betPercentage: string;
    startDate: string;
    deadline: string;
    marketId: string;
    marketTitle?: string;
    marketDescription?: string;
    clobTokenId?: string;
    owner: string;
  }): Promise<{
    success: boolean;
    data?: any;
    message?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/polyswap/orders/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to create polyswap order:', error);
      return {
        success: false,
        error: 'Failed to create order',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Create Polymarket order for a draft order
  async createPolymarketOrder(orderHash: string): Promise<{
    success: boolean;
    data?: {
      polymarketOrderHash: string;
    };
    message?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/polyswap/orders/polymarket`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderHash }),
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to create polymarket order:', error);
      return {
        success: false,
        error: 'Failed to create polymarket order',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get transaction data for signing by order ID
  async getTransactionDataById(orderId: number): Promise<{
    success: boolean;
    data?: {
      transaction: any;
      orderId: number;
      polymarketOrderHash: string;
    };
    message?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/polyswap/orders/id/${orderId}/transaction`);
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to fetch transaction data:', error);
      return {
        success: false,
        error: 'Failed to fetch transaction data',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Update order with transaction hash by order ID
  async updateOrderTransactionHashById(orderId: number, transactionHash: string): Promise<{
    success: boolean;
    data?: any;
    message?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/polyswap/orders/id/${orderId}/transaction`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactionHash }),
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to update transaction hash:', error);
      return {
        success: false,
        error: 'Failed to update transaction hash',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get polyswap orders by owner address
  async getOrdersByOwner(
    ownerAddress: string, 
    limit: number = 100, 
    offset: number = 0
  ): Promise<{
    success: boolean;
    data?: DatabasePolyswapOrder[];
    count?: number;
    pagination?: {
      limit: number;
      offset: number;
      hasMore: boolean;
    };
    message?: string;
    error?: string;
  }> {
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString()
      });
      
      const response = await fetch(`${this.baseUrl}/polyswap/orders/${ownerAddress}?${params}`);
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to fetch orders by owner:', error);
      return {
        success: false,
        error: 'Failed to fetch orders',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Convert backend market format to frontend format
  private convertBackendMarket(backendMarket: BackendMarket): ApiMarket {
    // Validate that backendMarket has the required properties
    if (!backendMarket || !backendMarket.outcomes || !backendMarket.outcome_prices) {
      throw new Error('Invalid market data structure');
    }
    
    // Ensure outcomes and outcome_prices are arrays
    if (!Array.isArray(backendMarket.outcomes) || !Array.isArray(backendMarket.outcome_prices)) {
      throw new Error('Invalid outcomes or outcome_prices format');
    }
    
    // For binary markets, we still check if it's a traditional Yes/No market
    // but we also create options for non-traditional binary markets
    const isTraditionalBinary = backendMarket.outcomes.length === 2 && 
                                backendMarket.outcomes.includes('Yes') && 
                                backendMarket.outcomes.includes('No');

    if (isTraditionalBinary) {
      const yesIndex = backendMarket.outcomes.indexOf('Yes');
      const noIndex = backendMarket.outcomes.indexOf('No');

      return {
        id: backendMarket.id,
        title: backendMarket.question,
        volume: parseFloat(backendMarket.volume) || 0,
        endDate: backendMarket.end_date,
        category: backendMarket.category,
        type: 'binary',
        // Convert decimal odds to percentages (multiply by 100) and round to 2 decimals
        yesOdds: Number(((backendMarket.outcome_prices[yesIndex] || 0) * 100).toFixed(2)),
        noOdds: Number(((backendMarket.outcome_prices[noIndex] || 0) * 100).toFixed(2)),
        conditionId: backendMarket.condition_id,
        slug: backendMarket.slug,
        eventSlug: backendMarket.event_slug || undefined,
        clobTokenIds: Array.isArray(backendMarket.clob_token_ids)
          ? backendMarket.clob_token_ids
          : typeof backendMarket.clob_token_ids === 'string'
            ? JSON.parse(backendMarket.clob_token_ids)
            : [],
        description: backendMarket.description
      };
    } else if (backendMarket.outcomes.length === 2) {
      // Non-traditional binary market - create options instead of hardcoding yes/no
      const options: MarketOption[] = backendMarket.outcomes.map((outcome, index) => ({
        text: outcome,
        // Convert decimal odds to percentages (multiply by 100) and round to 2 decimals
        odds: Number(((backendMarket.outcome_prices[index] || 0) * 100).toFixed(2))
      }));

      return {
        id: backendMarket.id,
        title: backendMarket.question,
        volume: parseFloat(backendMarket.volume) || 0,
        endDate: backendMarket.end_date,
        category: backendMarket.category,
        type: 'binary', // Still mark as binary for UI purposes
        options, // Include options for non-traditional binary markets
        conditionId: backendMarket.condition_id,
        slug: backendMarket.slug,
        eventSlug: backendMarket.event_slug || undefined,
        clobTokenIds: Array.isArray(backendMarket.clob_token_ids)
          ? backendMarket.clob_token_ids
          : typeof backendMarket.clob_token_ids === 'string'
            ? JSON.parse(backendMarket.clob_token_ids)
            : [],
        description: backendMarket.description
      };
    } else {
      // Multi-choice market
      const options: MarketOption[] = backendMarket.outcomes.map((outcome, index) => ({
        text: outcome,
        // Convert decimal odds to percentages (multiply by 100) and round to 2 decimals
        odds: Number(((backendMarket.outcome_prices[index] || 0) * 100).toFixed(2))
      }));

      return {
        id: backendMarket.id,
        title: backendMarket.question,
        volume: parseFloat(backendMarket.volume) || 0,
        endDate: backendMarket.end_date,
        category: backendMarket.category,
        type: 'multi-choice',
        options,
        conditionId: backendMarket.condition_id,
        slug: backendMarket.slug,
        eventSlug: backendMarket.event_slug || undefined,
        clobTokenIds: Array.isArray(backendMarket.clob_token_ids)
          ? backendMarket.clob_token_ids
          : typeof backendMarket.clob_token_ids === 'string'
            ? JSON.parse(backendMarket.clob_token_ids)
            : [],
        description: backendMarket.description
      };
    }
  }

  async getTopMarkets(): Promise<ApiMarket[]> {
    const response = await this.fetchApi('/markets/top');
    if (response.success && response.data) {
      return response.data.map((market: BackendMarket) => this.convertBackendMarket(market));
    }
    throw new Error(response.message || 'Failed to fetch top markets');
  }

  async searchMarkets(params: SearchParams): Promise<SearchResult> {
    const queryParams: Record<string, string | number> = {};
    
    if (params.q) {
      queryParams.q = params.q;
    }
    
    if (params.type) {
      queryParams.type = params.type;
    }
    
    if (params.category) {
      queryParams.category = params.category;
    }
    
    if (params.limit) {
      queryParams.limit = params.limit;
    }
    
    if (params.page && params.limit) {
      queryParams.offset = (params.page - 1) * params.limit;
    }

    const response = await this.fetchApi('/markets/search', queryParams);
    
    if (response.success && response.data) {
      const markets = response.data.map((market: BackendMarket) => this.convertBackendMarket(market));
      return {
        markets,
        pagination: response.pagination || {
          limit: params.limit || 100,
          offset: params.page ? (params.page - 1) * (params.limit || 100) : 0,
          hasMore: false
        }
      };
    }
    
    throw new Error(response.message || 'Failed to search markets');
  }

  async getMarketById(id: string): Promise<ApiMarket> {
    const response = await this.fetchApi(`/markets/${id}`);
    if (response.success && response.data) {
      return this.convertBackendMarket(response.data);
    }
    throw new Error(response.message || 'Failed to fetch market');
  }

  async getMarketsByCategory(category: string, page: number = 1, limit: number = 100): Promise<SearchResult> {
    const offset = (page - 1) * limit;
    const response = await this.fetchApi(`/markets/category/${category}`, { limit, offset });
    
    if (response.success && response.data) {
      const markets = response.data.map((market: BackendMarket) => this.convertBackendMarket(market));
      return {
        markets,
        pagination: response.pagination || {
          limit,
          offset,
          hasMore: false
        }
      };
    }
    
    throw new Error(response.message || 'Failed to fetch markets by category');
  }

  async getMarketBySlug(slug: string): Promise<ApiMarket | null> {
    const response = await this.fetchApi(`/markets/search?q=${slug}&type=slug`);

    if (response.success && response.data && Array.isArray(response.data) && response.data.length > 0) {
      const marketData = response.data[0];
      return this.convertBackendMarket(marketData);
    }
    // Gracefully indicate no slug match without throwing
    return null;
  }

  // Get a swap quote from CoW Protocol
  async getQuote(params: {
    sellToken: string;
    buyToken: string;
    sellAmount: string;
    userAddress: string;
    chainId?: number;
  }): Promise<{
    success: boolean;
    data?: {
      buyAmount: string;
      sellAmount: string;
      feeAmount: string;
      validTo: number;
      exchangeRate: string;
      buyAmountFormatted: string;
      sellAmountFormatted: string;
      sellTokenUsdPrice: number | null;
      buyTokenUsdPrice: number | null;
    };
    message?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/polyswap/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to fetch quote:', error);
      return {
        success: false,
        error: 'Failed to fetch quote',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const apiService = new ApiService();