import { EventEmitter } from 'events';
import { createClient, RedisClientType } from 'redis';
import { OrderBook } from '@arbot/shared';
import { BinanceWebSocketClient } from '../exchanges/binance';
import { CoinbaseWebSocketClient } from '../exchanges/coinbase';
import { KrakenWebSocketClient } from '../exchanges/kraken';
import { BybitWebSocketClient } from '../exchanges/bybit';
import { KuCoinWebSocketClient } from '../exchanges/kucoin';
import { GeminiWebSocketClient } from '../exchanges/gemini';
import { OpportunityDetector } from '../arbitrage/opportunity-detector';
import { ExchangeSymbolMapper } from '../exchanges/exchange-symbol-mapper';

interface BotConfig {
  exchanges: string[];
  symbols: string[];
  minProfitPercent: number;
  tradeAmount: number;
  isActive: boolean;
}

type ExchangeClient = BinanceWebSocketClient | CoinbaseWebSocketClient | KrakenWebSocketClient | 
                     BybitWebSocketClient | KuCoinWebSocketClient | GeminiWebSocketClient;

export class DynamicMarketDataManager extends EventEmitter {
  private redisClient: RedisClientType;
  private subscriberClient: RedisClientType;
  private opportunityDetector: OpportunityDetector;
  private symbolMapper: ExchangeSymbolMapper;
  private exchangeClients = new Map<string, ExchangeClient>();
  private isRunning = false;
  private currentConfig: BotConfig;

  constructor() {
    super();
    
    // Initialize Redis clients
    this.redisClient = createClient({
      url: process.env['REDIS_URL'] || 'redis://localhost:6379'
    });
    
    this.subscriberClient = createClient({
      url: process.env['REDIS_URL'] || 'redis://localhost:6379'
    });
    
    // Initialize opportunity detector
    this.opportunityDetector = new OpportunityDetector();
    
    // Initialize symbol mapper
    this.symbolMapper = new ExchangeSymbolMapper();
    
    // Default configuration (will be updated with discovered symbols)
    this.currentConfig = {
      exchanges: ['binance', 'coinbase', 'kraken'],
      symbols: ['BTCUSD', 'ETHUSD'], // Fallback, will be replaced with discovered symbols
      minProfitPercent: 0.1,
      tradeAmount: 0.01,
      isActive: true
    };
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Opportunity detector events
    this.opportunityDetector.on('opportunity_detected', (opportunity) => {
      this.emit('arbitrage_opportunity', opportunity);
    });

  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      // Connect to Redis
      await this.redisClient.connect();
      await this.subscriberClient.connect();
      
      // Subscribe to config updates
      await this.subscriberClient.subscribe('bot:config:update', (message) => {
        try {
          const newConfig = JSON.parse(message) as BotConfig;
          this.updateConfiguration(newConfig);
        } catch (error) {
          console.error('Error parsing config update:', error);
        }
      });
      
      // Load initial configuration
      await this.loadConfiguration();
      
      // Discover compatible symbols across exchanges
      await this.discoverCompatibleSymbols();
      
      // Start with current configuration
      await this.startExchangeConnections();
      
      this.isRunning = true;
      
      // Update bot status
      await this.updateBotStatus();
      
      // Set up periodic status updates every 10 seconds
      setInterval(() => {
        this.updateBotStatus();
      }, 10000);
      
      this.emit('started');
      
    } catch (error) {
      console.error('❌ Failed to start Dynamic Market Data Manager:', error);
      this.emit('error', error);
      throw error;
    }
  }

  private async loadConfiguration(): Promise<void> {
    try {
      const configStr = await this.redisClient.get('bot:config');
      if (configStr) {
        this.currentConfig = JSON.parse(configStr);
      }
      
      // Update opportunity detector config
      this.opportunityDetector.updateConfig({
        minProfitPercent: this.currentConfig.minProfitPercent
      });
      
      // Update trade amount
      this.opportunityDetector.updateTradeAmount(this.currentConfig.tradeAmount);
      
    } catch (error) {
      console.error('Error loading configuration:', error);
    }
  }

  private async updateConfiguration(newConfig: BotConfig): Promise<void> {
    const oldConfig = { ...this.currentConfig };
    this.currentConfig = newConfig;
    
    // Update opportunity detector
    this.opportunityDetector.updateConfig({
      minProfitPercent: newConfig.minProfitPercent
    });
    
    // Update trade amount
    this.opportunityDetector.updateTradeAmount(newConfig.tradeAmount);
    
    // Check if exchanges or symbols changed
    const exchangesChanged = JSON.stringify(oldConfig.exchanges.sort()) !== JSON.stringify(newConfig.exchanges.sort());
    const symbolsChanged = JSON.stringify(oldConfig.symbols.sort()) !== JSON.stringify(newConfig.symbols.sort());
    
    if (exchangesChanged || symbolsChanged) {
      console.log('🔄 Configuration changed, restarting connections...');
      await this.restartExchangeConnections();
    }
    
    await this.updateBotStatus();
  }

  private async startExchangeConnections(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const exchangeId of this.currentConfig.exchanges) {
      if (!this.currentConfig.isActive) continue;
      
      const client = this.createExchangeClient(exchangeId);
      if (client) {
        this.exchangeClients.set(exchangeId, client);
        this.setupExchangeEventHandlers(client, exchangeId);
        promises.push(client.connect());
      }
    }
    
    await Promise.all(promises);
  }

  private async restartExchangeConnections(): Promise<void> {
    // Disconnect all existing clients
    for (const [_exchangeId, client] of Array.from(this.exchangeClients)) {
      client.disconnect();
    }
    this.exchangeClients.clear();
    
    // Start new connections
    await this.startExchangeConnections();
  }

  private createExchangeClient(exchangeId: string): ExchangeClient | null {
    const symbols = this.getSymbolsForExchange(exchangeId);
    
    switch (exchangeId) {
      case 'binance':
        return new BinanceWebSocketClient(symbols);
      case 'coinbase':
        return new CoinbaseWebSocketClient(symbols);
      case 'kraken':
        return new KrakenWebSocketClient(symbols);
      case 'bybit':
        return new BybitWebSocketClient(symbols);
      case 'kucoin':
        return new KuCoinWebSocketClient(symbols);
      case 'gemini':
        return new GeminiWebSocketClient(symbols);
      default:
        console.warn(`Unknown exchange: ${exchangeId}`);
        return null;
    }
  }

  private async discoverCompatibleSymbols(): Promise<void> {
    try {
      console.log('🔍 Validating configured symbols across exchanges...');
      console.log(`📋 Configured symbols: [${this.currentConfig.symbols.join(', ')}]`);
      // Only use symbols from Redis config, not all discovered symbols
      
      // Validate that the configured symbols are supported by all active exchanges
      const configuredSymbols = this.currentConfig.symbols.map(symbol => {
        // Extract base currency from symbol (e.g., LTCUSD -> LTC)
        const baseCurrency = symbol.replace(/USD[T]?$/, '');
        return baseCurrency;
      });
      
      const commonSymbols = this.symbolMapper.findCommonSymbols(
        this.currentConfig.exchanges,
        configuredSymbols
      );
      
      if (commonSymbols.size > 0) {
        console.log(`✅ All configured symbols are supported by active exchanges`);
        
        // Show the mapping for debugging
        for (const [normalizedSymbol, exchangeSymbols] of Array.from(commonSymbols)) {
          console.log(`📊 ${normalizedSymbol}:`);
          for (const [exchangeId, exchangeSymbol] of Array.from(exchangeSymbols)) {
            console.log(`  ${exchangeId}: ${exchangeSymbol}`);
          }
        }
      } else {
        console.warn('⚠️ Some configured symbols are not supported by all active exchanges');
        console.log('Using configured symbols anyway:', this.currentConfig.symbols);
      }
      
    } catch (error) {
      console.error('Error validating configured symbols:', error);
      console.log('Using configured symbols:', this.currentConfig.symbols);
    }
  }

  private getSymbolsForExchange(exchangeId: string): string[] {
    // Use ONLY the symbols from Redis config, not all possible symbols
    const symbols: string[] = [];
    
    // Convert each configured symbol to the exchange's native format
    for (const configuredSymbol of this.currentConfig.symbols) {
      const exchangeSymbol = this.symbolMapper.toExchangeSymbol(configuredSymbol, exchangeId);
      if (exchangeSymbol) {
        symbols.push(exchangeSymbol);
      }
    }
    
    console.log(`📋 ${exchangeId} symbols from Redis config (fixed):`, symbols);
    return symbols;
  }

  private setupExchangeEventHandlers(client: ExchangeClient, _exchangeId: string): void {
    client.on('connected', (data) => {
      this.emit('exchange_connected', data);
      this.updateBotStatus();
    });

    client.on('orderbook', (orderBook: OrderBook) => {
      this.handleOrderBookUpdate(orderBook);
    });

    client.on('error', (error) => {
      console.error(`❌ ${error.exchange} error:`, error.error);
      this.emit('exchange_error', error);
    });
  }

  private async handleOrderBookUpdate(orderBook: OrderBook): Promise<void> {
    try {
      // Cache in Redis with TTL of 10 seconds
      const key = `orderbook:${orderBook.exchange}:${orderBook.symbol}`;
      await this.redisClient.setEx(key, 10, JSON.stringify(orderBook));
      
      // Feed to opportunity detector
      this.opportunityDetector.updateOrderBook(orderBook);
      
      // Emit for real-time processing
      this.emit('orderbook_update', orderBook);
      
    } catch (error) {
      console.error('❌ Error handling order book update:', error);
    }
  }

  private async updateBotStatus(): Promise<void> {
    try {
      const status = {
        isRunning: this.isRunning && this.currentConfig.isActive,
        connectedExchanges: Array.from(this.exchangeClients.keys()),
        lastOpportunity: null, // This would be updated by opportunity detector
        uptime: this.isRunning ? Date.now() : 0,
        config: this.currentConfig
      };
      
      console.log('📊 Updating bot status:', {
        isRunning: status.isRunning,
        connectedExchanges: status.connectedExchanges,
        configActive: this.currentConfig.isActive,
        managerRunning: this.isRunning
      });
      
      await this.redisClient.set('bot:status', JSON.stringify(status));
    } catch (error) {
      console.error('Error updating bot status:', error);
    }
  }

  async getOrderBook(exchange: string, symbol: string): Promise<OrderBook | null> {
    try {
      const key = `orderbook:${exchange}:${symbol}`;
      const data = await this.redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('❌ Error retrieving order book from Redis:', error);
      return null;
    }
  }

  async getAllOrderBooks(): Promise<OrderBook[]> {
    try {
      const keys = await this.redisClient.keys('orderbook:*');
      const orderBooks: OrderBook[] = [];
      
      for (const key of keys) {
        const data = await this.redisClient.get(key);
        if (data) {
          orderBooks.push(JSON.parse(data));
        }
      }
      
      return orderBooks;
    } catch (error) {
      console.error('❌ Error retrieving all order books:', error);
      return [];
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    // Disconnect all exchange clients
    for (const [_exchangeId, client] of Array.from(this.exchangeClients)) {
      client.disconnect();
    }
    this.exchangeClients.clear();
    
    // Disconnect Redis
    await this.redisClient.disconnect();
    await this.subscriberClient.disconnect();
    
    this.isRunning = false;
    await this.updateBotStatus();
    this.emit('stopped');
  }

  isManagerRunning(): boolean {
    return this.isRunning;
  }

  getCurrentConfig(): BotConfig {
    return { ...this.currentConfig };
  }
}
