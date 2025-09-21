import WebSocket from 'ws';
import { OrderBook, OrderBookEntry, ExchangeName } from '@arbot/shared';
import { BaseExchange, TradingPair, ExchangeInfo } from './base-exchange';

interface BinanceDepthUpdate {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
  U: number; // First update ID in event
  u: number; // Final update ID in event
  b: [string, string][]; // Bids to be updated
  a: [string, string][]; // Asks to be updated
}

interface BinanceOrderBookSnapshot {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

export class BinanceWebSocketClient extends BaseExchange {
  private ws: WebSocket | null = null;
  private readonly baseUrl = 'wss://stream.binance.com:9443/ws';
  private readonly restUrl = 'https://api.binance.com/api/v3';
  constructor(symbols: string[] = ['BTCUSDT', 'ETHUSDT']) {
    super('binance', symbols);
  }

  async getExchangeInfo(): Promise<ExchangeInfo> {
    try {
      const response = await fetch(`${this.restUrl}/exchangeInfo`);
      const data = await response.json();
      
      const tradingPairs: TradingPair[] = data.symbols
        .filter((symbol: any) => symbol.status === 'TRADING')
        .map((symbol: any) => ({
          symbol: symbol.symbol,
          baseAsset: symbol.baseAsset,
          quoteAsset: symbol.quoteAsset,
          normalizedSymbol: this.normalizeSymbol(symbol.baseAsset, symbol.quoteAsset),
          active: symbol.status === 'TRADING',
          minOrderSize: parseFloat(symbol.filters?.find((f: any) => f.filterType === 'LOT_SIZE')?.minQty || '0'),
          tickSize: parseFloat(symbol.filters?.find((f: any) => f.filterType === 'PRICE_FILTER')?.tickSize || '0')
        }));

      return {
        name: 'Binance',
        id: 'binance',
        tradingPairs,
        fees: {
          taker: 0.001, // 0.1% default, can be lower with BNB
          maker: 0.001
        },
        rateLimit: 1200 // requests per minute
      };
    } catch (error) {
      console.error('[Binance] Failed to get exchange info:', error);
      throw error;
    }
  }

  subscribeToOrderBooks(symbols: string[]): void {
    if (!this.ws) return;

    // Binance uses lowercase symbols for WebSocket
    const streams = symbols.map(symbol => `${symbol.toLowerCase()}@depth`).join('/');
    const wsUrl = `${this.baseUrl}/${streams}`;
    
    // Close existing connection and create new one with updated symbols
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    
    this.ws = new WebSocket(wsUrl);
    this.setupWebSocketHandlers();
  }

  async connect(): Promise<void> {
    try {
      // Get initial snapshots for all symbols
      await this.initializeOrderBooks();
      
      // Create WebSocket connection
      const streams = this.symbols.map(symbol => `${symbol.toLowerCase()}@depth`).join('/');
      const wsUrl = `${this.baseUrl}/${streams}`;
      
      this.ws = new WebSocket(wsUrl);
      this.setupWebSocketHandlers();

    } catch (error) {
      console.error('[Binance] Connection failed:', error);
      this.handleReconnect();
    }
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.emit('connected', { exchange: ExchangeName.BINANCE });
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as BinanceDepthUpdate;
        this.handleDepthUpdate(message);
      } catch (error) {
        console.error('[Binance] Error parsing message:', error);
      }
    });

    this.ws.on('close', () => {
      this.handleReconnect();
    });

    this.ws.on('error', (error) => {
      console.error('[Binance] WebSocket error:', error);
      this.emit('error', { exchange: ExchangeName.BINANCE, error });
    });
  }

  private async initializeOrderBooks(): Promise<void> {
    console.log('[Binance] Initializing order book snapshots...');
    
    for (const symbol of this.symbols) {
      try {
        const response = await fetch(`${this.restUrl}/depth?symbol=${symbol}&limit=50`);
        const snapshot: BinanceOrderBookSnapshot = await response.json();
        
        if (!snapshot.bids || !snapshot.asks) {
          console.error(`[Binance] Invalid response for ${symbol}:`, snapshot);
          continue;
        }
        
        const orderBook: OrderBook = {
          symbol,
          exchange: ExchangeName.BINANCE,
          bids: snapshot.bids.map(([price, quantity]) => ({ price, quantity })),
          asks: snapshot.asks.map(([price, quantity]) => ({ price, quantity })),
          timestamp: Date.now(),
          lastUpdateId: snapshot.lastUpdateId
        };
        
        this.orderBooks.set(symbol, orderBook);
        console.log(`[Binance] Initialized ${symbol} order book (${snapshot.bids.length} bids, ${snapshot.asks.length} asks)`);
      } catch (error) {
        console.error(`[Binance] Failed to initialize ${symbol} order book:`, error);
      }
    }
  }

  private handleDepthUpdate(update: BinanceDepthUpdate): void {
    const symbol = update.s;
    const existingOrderBook = this.orderBooks.get(symbol);
    
    if (!existingOrderBook) {
      console.warn(`[Binance] Received update for unknown symbol: ${symbol}`);
      return;
    }

    // Check if this update is in sequence
    if (existingOrderBook.lastUpdateId && update.U <= existingOrderBook.lastUpdateId) {
      return; // Skip old updates
    }

    // Update bids and asks
    const updatedBids = this.updateOrderBookSide(existingOrderBook.bids, update.b, 'bids');
    const updatedAsks = this.updateOrderBookSide(existingOrderBook.asks, update.a, 'asks');

    const updatedOrderBook: OrderBook = {
      ...existingOrderBook,
      bids: updatedBids,
      asks: updatedAsks,
      timestamp: update.E,
      lastUpdateId: update.u
    };

    this.orderBooks.set(symbol, updatedOrderBook);
    
    // Emit the updated order book
    this.emit('orderbook', updatedOrderBook);
  }

  private updateOrderBookSide(
    existing: OrderBookEntry[], 
    updates: [string, string][],
    side: 'bids' | 'asks'
  ): OrderBookEntry[] {
    const priceMap = new Map<string, string>();
    
    // Add existing entries
    existing.forEach(entry => {
      priceMap.set(entry.price, entry.quantity);
    });
    
    // Apply updates
    updates.forEach(([price, quantity]) => {
      if (parseFloat(quantity) === 0) {
        priceMap.delete(price); // Remove if quantity is 0
      } else {
        priceMap.set(price, quantity);
      }
    });
    
    // Convert back to array and sort correctly
    const result = Array.from(priceMap.entries())
      .map(([price, quantity]) => ({ price, quantity }))
      .sort((a, b) => {
        const priceA = parseFloat(a.price);
        const priceB = parseFloat(b.price);
        // Bids: highest first (descending), Asks: lowest first (ascending)
        return side === 'bids' ? priceB - priceA : priceA - priceB;
      });
    
    return result;
  }

  disconnect(): void {
    this.cleanupReconnect();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
