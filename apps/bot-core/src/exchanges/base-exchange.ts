import { EventEmitter } from 'events';
import { OrderBook } from '@arbot/shared';

export interface TradingPair {
  symbol: string;           // Exchange's native symbol (e.g., 'BTCUSDT', 'BTC-USD', 'BTC/USD')
  baseAsset: string;        // Base currency (e.g., 'BTC')
  quoteAsset: string;       // Quote currency (e.g., 'USD', 'USDT')
  normalizedSymbol: string; // Our normalized format (e.g., 'BTCUSD')
  active: boolean;          // Whether trading is active
  minOrderSize?: number;    // Minimum order size
  tickSize?: number;        // Price tick size
}

export interface ExchangeInfo {
  name: string;
  id: string;
  tradingPairs: TradingPair[];
  fees: {
    taker: number;
    maker: number;
  };
  rateLimit: number; // requests per minute
}

export abstract class BaseExchange extends EventEmitter {
  protected orderBooks = new Map<string, OrderBook>();
  protected tradingPairs: TradingPair[] = [];
  protected reconnectAttempts = 0;
  protected readonly maxReconnectAttempts = 5;
  protected reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(
    protected exchangeId: string,
    protected symbols: string[] = []
  ) {
    super();
  }

  // Abstract methods that each exchange must implement
  abstract connect(): Promise<void>;
  abstract disconnect(): void;
  abstract getExchangeInfo(): Promise<ExchangeInfo>;
  abstract subscribeToOrderBooks(symbols: string[]): void;

  // Common methods
  async discoverTradingPairs(): Promise<TradingPair[]> {
    const exchangeInfo = await this.getExchangeInfo();
    this.tradingPairs = exchangeInfo.tradingPairs;
    return this.tradingPairs;
  }

  getTradingPairs(): TradingPair[] {
    return this.tradingPairs;
  }

  getOrderBook(symbol: string): OrderBook | undefined {
    return this.orderBooks.get(symbol);
  }

  getAllOrderBooks(): Map<string, OrderBook> {
    return new Map(this.orderBooks);
  }

  // Symbol normalization utilities
  protected normalizeSymbol(baseAsset: string, quoteAsset: string): string {
    // Normalize quote asset (USDT -> USD for consistency)
    const normalizedQuote = quoteAsset === 'USDT' ? 'USD' : quoteAsset;
    return `${baseAsset}${normalizedQuote}`;
  }

  protected parseSymbol(_symbol: string): { baseAsset: string; quoteAsset: string } | null {
    // This will be overridden by each exchange based on their symbol format
    return null;
  }

  protected handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[${this.exchangeId}] Max reconnection attempts reached`);
      this.emit('error', { 
        exchange: this.exchangeId, 
        error: new Error('Max reconnection attempts reached') 
      });
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  protected cleanupReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}
