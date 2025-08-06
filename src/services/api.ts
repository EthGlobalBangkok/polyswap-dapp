const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Backend API response format
export interface BackendMarket {
  id: string;
  question: string;
  condition_id: string;
  category: string;
  start_date: string;
  end_date: string;
  volume: string;
  outcomes: string[];
  outcome_prices: string[];
  created_at: string;
  updated_at: string;
}

export interface BackendApiResponse {
  success: boolean;
  data: BackendMarket[];
  count: number;
  message: string;
}

// Frontend market format
export interface ApiMarket {
  id: string;
  title: string;
  description: string;
  volume: number;
  endDate: string;
  category: string;
  isActive: boolean;
  type: 'binary' | 'multi-choice';
  yesOdds?: number;
  noOdds?: number;
  options?: Array<{
    id: string;
    label: string;
    odds: number;
    color?: string;
  }>;
}

export interface SearchParams {
  q: string;
  type?: 'all' | 'binary' | 'multi-choice';
}

class ApiService {
  private async fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  // Convert backend market format to frontend format
  private convertBackendMarket(backendMarket: BackendMarket): ApiMarket {
    const volume = parseFloat(backendMarket.volume);
    const yesPrice = parseFloat(backendMarket.outcome_prices[0]);
    const noPrice = parseFloat(backendMarket.outcome_prices[1]);
    
    // Convert prices to percentages (prices are 0-1, we need 0-100)
    const yesOdds = Math.round(yesPrice * 100);
    const noOdds = Math.round(noPrice * 100);

    // Determine if it's a multi-choice market (more than 2 outcomes)
    const isMultiChoice = backendMarket.outcomes.length > 2;

    if (isMultiChoice) {
      // Handle multi-choice markets
      const options = backendMarket.outcomes.map((outcome, index) => ({
        id: outcome.toLowerCase().replace(/\s+/g, '-'),
        label: outcome,
        odds: Math.round(parseFloat(backendMarket.outcome_prices[index]) * 100),
        color: this.getColorForOption(outcome, index),
      }));

      return {
        id: backendMarket.id,
        title: backendMarket.question,
        description: `Market resolves to the winning outcome.`,
        volume,
        endDate: backendMarket.end_date,
        category: backendMarket.category, // Use category from backend
        isActive: true, // All markets from API are active
        type: 'multi-choice',
        options,
      };
    } else {
      // Handle binary markets (Yes/No)
      return {
        id: backendMarket.id,
        title: backendMarket.question,
        description: `Market resolves to "Yes" if the condition is met.`,
        volume,
        endDate: backendMarket.end_date,
        category: backendMarket.category, // Use category from backend
        isActive: true,
        type: 'binary',
        yesOdds,
        noOdds,
      };
    }
  }

  // Get color for multi-choice options
  private getColorForOption(outcome: string, index: number): string {
    const colors = [
      '#ef4444', // red
      '#3b82f6', // blue
      '#10b981', // green
      '#f59e0b', // amber
      '#8b5cf6', // purple
      '#06b6d4', // cyan
      '#f97316', // orange
      '#84cc16', // lime
    ];
    
    return colors[index % colors.length];
  }

  // Format search query - split words and join with commas
  private formatSearchQuery(query: string): string {
    return query
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0)
      .join(',');
  }

  async getTopMarkets(): Promise<ApiMarket[]> {
    const response = await this.fetchApi<BackendApiResponse>('/api/markets/top');
    return response.data.map(market => this.convertBackendMarket(market));
  }

  async searchMarkets(params: SearchParams): Promise<ApiMarket[]> {
    const formattedQuery = this.formatSearchQuery(params.q);
    const searchParams = new URLSearchParams({
      q: formattedQuery,
      type: 'all', // Always include type=all
    });

    const response = await this.fetchApi<BackendApiResponse>(`/api/markets/search?${searchParams.toString()}`);
    return response.data.map(market => this.convertBackendMarket(market));
  }

  async getMarketById(marketId: string): Promise<ApiMarket | null> {
    try {
      const response = await this.fetchApi<{ success: boolean; data: BackendMarket }>(`/api/markets/${marketId}`);
      return response.data ? this.convertBackendMarket(response.data) : null;
    } catch (error) {
      console.error('Failed to fetch market by ID:', error);
      return null;
    }
  }
}

export const apiService = new ApiService(); 