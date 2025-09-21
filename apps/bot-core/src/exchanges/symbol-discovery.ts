import { BaseExchange, TradingPair } from './base-exchange';
import { SymbolNormalizer } from './symbol-normalizer';
import { BinanceWebSocketClient } from './binance';
import { CoinbaseWebSocketClient } from './coinbase';
import { KrakenWebSocketClient } from './kraken';
import { BybitWebSocketClient } from './bybit';
import { KuCoinWebSocketClient } from './kucoin';
import { GeminiWebSocketClient } from './gemini';

export interface DiscoveryConfig {
  enabledExchanges: string[];
  minExchangesPerSymbol: number;
  maxSymbolsPerExchange: number;
  preferredQuoteAssets: string[];
  preferredBaseAssets: string[];
}

export class SymbolDiscoveryService {
  private normalizer = new SymbolNormalizer();
  private exchanges = new Map<string, BaseExchange>();

  constructor(private config: DiscoveryConfig) {}

  async discoverSymbols(): Promise<{
    availableSymbols: string[];
    exchangeStats: Map<string, number>;
    recommendations: string[];
  }> {
    console.log('🔍 Discovering trading pairs across exchanges...');
    
    // Initialize exchanges
    await this.initializeExchanges();
    
    // Discover trading pairs from each exchange
    await this.fetchTradingPairs();
    
    // Get available symbols
    const availableSymbols = this.normalizer.getAvailableSymbols(this.config.minExchangesPerSymbol);
    const stats = this.normalizer.getStats();
    
    // Generate recommendations based on preferences
    const recommendations = this.generateRecommendations(availableSymbols);
    
    console.log(`✅ Discovery complete: ${availableSymbols.length} symbols available across ${this.config.enabledExchanges.length} exchanges`);
    
    return {
      availableSymbols,
      exchangeStats: stats.exchangeCoverage,
      recommendations
    };
  }

  private async initializeExchanges(): Promise<void> {
    for (const exchangeId of this.config.enabledExchanges) {
      let exchange: BaseExchange;
      
      switch (exchangeId) {
        case 'binance':
          exchange = new BinanceWebSocketClient([]);
          break;
        case 'coinbase':
          exchange = new CoinbaseWebSocketClient([]);
          break;
        case 'kraken':
          exchange = new KrakenWebSocketClient([]);
          break;
        case 'bybit':
          exchange = new BybitWebSocketClient([]);
          break;
        case 'kucoin':
          exchange = new KuCoinWebSocketClient([]);
          break;
        case 'gemini':
          exchange = new GeminiWebSocketClient([]);
          break;
        default:
          console.warn(`Unknown exchange: ${exchangeId}`);
          continue;
      }
      
      this.exchanges.set(exchangeId, exchange);
    }
  }

  private async fetchTradingPairs(): Promise<void> {
    const promises = Array.from(this.exchanges.entries()).map(async ([exchangeId, exchange]) => {
      try {
        console.log(`📡 Fetching trading pairs from ${exchangeId}...`);
        const tradingPairs = await exchange.discoverTradingPairs();
        
        // Filter by preferences if specified
        const filteredPairs = this.filterTradingPairs(tradingPairs, exchangeId);
        
        this.normalizer.addTradingPairs(exchangeId, filteredPairs);
        console.log(`✅ ${exchangeId}: ${filteredPairs.length} trading pairs discovered`);
        
      } catch (error) {
        console.error(`❌ Failed to fetch trading pairs from ${exchangeId}:`, error);
      }
    });

    await Promise.all(promises);
  }

  private filterTradingPairs(pairs: TradingPair[], exchangeId: string): TradingPair[] {
    let filtered = pairs.filter(pair => pair.active);

    // Filter by preferred quote assets
    if (this.config.preferredQuoteAssets.length > 0) {
      filtered = filtered.filter(pair => 
        this.config.preferredQuoteAssets.some(quote => 
          pair.quoteAsset === quote || 
          (quote === 'USD' && ['USDT', 'USDC'].includes(pair.quoteAsset))
        )
      );
    }

    // Filter by preferred base assets
    if (this.config.preferredBaseAssets.length > 0) {
      filtered = filtered.filter(pair => 
        this.config.preferredBaseAssets.includes(pair.baseAsset)
      );
    }

    // Limit number of symbols per exchange
    if (this.config.maxSymbolsPerExchange > 0) {
      // Sort by volume or other criteria if available, for now just take first N
      filtered = filtered.slice(0, this.config.maxSymbolsPerExchange);
    }

    return filtered;
  }

  private generateRecommendations(availableSymbols: string[]): string[] {
    // Prioritize symbols based on:
    // 1. Number of exchanges supporting them
    // 2. Preferred quote assets
    // 3. Preferred base assets
    
    const scored = availableSymbols.map(symbol => {
      const exchanges = this.normalizer.getExchangesForSymbol(symbol);
      let score = exchanges.length * 10; // Base score from exchange count
      
      // Bonus for preferred quote assets
      if (symbol.endsWith('USD') || symbol.endsWith('USDT')) {
        score += 20;
      }
      
      // Bonus for major cryptocurrencies
      if (symbol.startsWith('BTC') || symbol.startsWith('ETH')) {
        score += 15;
      } else if (['SOL', 'ADA', 'MATIC', 'AVAX'].some(base => symbol.startsWith(base))) {
        score += 10;
      }
      
      return { symbol, score, exchangeCount: exchanges.length };
    });

    // Sort by score and return top recommendations
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 20) // Top 20 recommendations
      .map(item => item.symbol);
  }

  getExchangeSymbol(normalizedSymbol: string, exchangeId: string): string | null {
    return this.normalizer.getExchangeSymbol(normalizedSymbol, exchangeId);
  }

  getExchangesForSymbol(normalizedSymbol: string): string[] {
    return this.normalizer.getExchangesForSymbol(normalizedSymbol);
  }

  getNormalizedSymbol(exchangeId: string, exchangeSymbol: string): string | null {
    return this.normalizer.getNormalizedSymbol(exchangeId, exchangeSymbol);
  }

  getAssetGroups(): Map<string, string[]> {
    return this.normalizer.getAssetGroups();
  }

  getStats() {
    return this.normalizer.getStats();
  }

  // Get optimal symbol selection for arbitrage
  getArbitrageSymbols(maxSymbols: number = 10): string[] {
    const availableSymbols = this.normalizer.getAvailableSymbols(2);
    const recommendations = this.generateRecommendations(availableSymbols);
    
    // Filter to ensure good exchange coverage
    const filtered = recommendations.filter(symbol => {
      const exchanges = this.normalizer.getExchangesForSymbol(symbol);
      return exchanges.length >= 2; // At least 2 exchanges for arbitrage
    });

    return filtered.slice(0, maxSymbols);
  }
}
