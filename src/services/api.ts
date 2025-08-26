// API service for communicating with the backend
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
    
    const isBinary = backendMarket.outcomes.length === 2 && 
                     backendMarket.outcomes.includes('Yes') && 
                     backendMarket.outcomes.includes('No');

    if (isBinary) {
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

  async getMarketBySlug(slug: string): Promise<ApiMarket> {
    const response = await this.fetchApi(`/markets/search?q=${slug}&type=slug`);
    
    if (response.success && response.data && Array.isArray(response.data) && response.data.length > 0) {
      const marketData = response.data[0];
      return this.convertBackendMarket(marketData);
    }
    
    throw new Error(response.message || 'No market found with slug: ' + slug);
  }
}

export const apiService = new ApiService(); 