import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { OrderBook, OrderBookEntry, ExchangeName } from '@arbot/shared';

interface CoinbaseSubscribeMessage {
  type: 'subscribe';
  product_ids: string[];
  channels: string[];
}

interface CoinbaseLevel2Update {
  type: 'l2update';
  product_id: string;
  time: string;
  changes: [string, string, string][]; // [side, price, size]
}

interface CoinbaseTicker {
  type: 'ticker';
  product_id: string;
  time: string;
  best_bid: string;
  best_ask: string;
  price: string;
}

interface CoinbaseSnapshot {
  type: 'snapshot';
  product_id: string;
  bids: [string, string][];
  asks: [string, string][];
  time?: string;
}

interface CoinbaseOrderBookResponse {
  bids: [string, string][];
  asks: [string, string][];
}

export class CoinbaseWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly wsUrl = 'wss://ws-feed.exchange.coinbase.com';
  private readonly restUrl = 'https://api.exchange.coinbase.com';
  private orderBooks = new Map<string, OrderBook>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(private symbols: string[] = ['BTC-USD', 'ETH-USD']) {
    super();
  }

  async connect(): Promise<void> {
    try {
      // Get initial snapshots for all symbols
      await this.initializeOrderBooks();
      
      // Create WebSocket connection
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
        console.log(`[Coinbase] WebSocket connected for symbols: ${this.symbols.join(', ')}`);
        this.subscribeToOrderBooks();
        this.reconnectAttempts = 0;
        this.emit('connected', { exchange: ExchangeName.COINBASE });
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('[Coinbase] Error parsing message:', error);
        }
      });

      this.ws.on('close', () => {
        console.log('[Coinbase] WebSocket closed');
        this.handleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('[Coinbase] WebSocket error:', error);
        this.emit('error', { exchange: ExchangeName.COINBASE, error });
      });

    } catch (error) {
      console.error('[Coinbase] Connection failed:', error);
      this.handleReconnect();
    }
  }

  private subscribeToOrderBooks(): void {
    if (!this.ws) return;

    const subscribeMessage: CoinbaseSubscribeMessage = {
      type: 'subscribe',
      product_ids: this.symbols,
      channels: ['ticker']  // Use ticker instead of level2 (no auth required)
    };

    this.ws.send(JSON.stringify(subscribeMessage));
    console.log('[Coinbase] Subscribed to ticker updates');
  }

  private async initializeOrderBooks(): Promise<void> {
    console.log('[Coinbase] Initializing order book snapshots...');
    
    for (const symbol of this.symbols) {
      try {
        const response = await fetch(`${this.restUrl}/products/${symbol}/book?level=2`);
        const snapshot: CoinbaseOrderBookResponse = await response.json();
        
        // Keep top 100 levels for accurate arbitrage analysis (matches Binance depth)
        const orderBook: OrderBook = {
          symbol,
          exchange: ExchangeName.COINBASE,
          bids: snapshot.bids.slice(0, 50).map(([price, quantity]) => ({ price, quantity })),
          asks: snapshot.asks.slice(0, 50).map(([price, quantity]) => ({ price, quantity })),
          timestamp: Date.now()
        };
        
        this.orderBooks.set(symbol, orderBook);
        console.log(`[Coinbase] Initialized ${symbol} order book (${orderBook.bids.length} bids, ${orderBook.asks.length} asks) - trimmed from ${snapshot.bids.length} total`);
      } catch (error) {
        console.error(`[Coinbase] Failed to initialize ${symbol} order book:`, error);
      }
    }
  }


  private handleMessage(message: any): void {
    switch (message.type) {
      case 'snapshot':
        this.handleSnapshot(message as CoinbaseSnapshot);
        break;
      case 'l2update':
        this.handleL2Update(message as CoinbaseLevel2Update);
        break;
      case 'ticker':
        this.handleTicker(message as CoinbaseTicker);
        break;
      case 'subscriptions':
        // Subscription confirmed - no logging needed
        break;
      default:
        // Unknown message type - no logging needed
        break;
    }
  }

  private handleSnapshot(snapshot: CoinbaseSnapshot): void {
    const orderBook: OrderBook = {
      symbol: snapshot.product_id,
      exchange: ExchangeName.COINBASE,
      bids: snapshot.bids.map(([price, quantity]) => ({ price, quantity })),
      asks: snapshot.asks.map(([price, quantity]) => ({ price, quantity })),
      timestamp: new Date(snapshot.time || Date.now()).getTime()
    };

    this.orderBooks.set(snapshot.product_id, orderBook);
    this.emit('orderbook', orderBook);
  }

  private handleTicker(ticker: CoinbaseTicker): void {
    // Update existing order book with latest best bid/ask from ticker
    const existingOrderBook = this.orderBooks.get(ticker.product_id);
    if (!existingOrderBook) {
      console.warn(`[Coinbase] Received ticker for ${ticker.product_id} but no order book exists`);
      return;
    }

    // Update the best bid/ask prices while keeping the depth
    if (existingOrderBook.bids.length > 0 && existingOrderBook.bids[0]) {
      existingOrderBook.bids[0].price = ticker.best_bid;
    }
    if (existingOrderBook.asks.length > 0 && existingOrderBook.asks[0]) {
      existingOrderBook.asks[0].price = ticker.best_ask;
    }
    
    existingOrderBook.timestamp = new Date(ticker.time).getTime();
    this.emit('orderbook', existingOrderBook);
  }

  private handleL2Update(update: CoinbaseLevel2Update): void {
    const symbol = update.product_id;
    const existingOrderBook = this.orderBooks.get(symbol);
    
    if (!existingOrderBook) {
      console.warn(`[Coinbase] Received update for unknown symbol: ${symbol}`);
      return;
    }

    let updatedBids = [...existingOrderBook.bids];
    let updatedAsks = [...existingOrderBook.asks];

    // Apply changes
    update.changes.forEach(([side, price, size]) => {
      const quantity = size;
      
      if (side === 'buy') {
        updatedBids = this.updateOrderBookSide(updatedBids, price, quantity);
      } else if (side === 'sell') {
        updatedAsks = this.updateOrderBookSide(updatedAsks, price, quantity);
      }
    });

    const updatedOrderBook: OrderBook = {
      ...existingOrderBook,
      bids: updatedBids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)), // Descending
      asks: updatedAsks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)), // Ascending
      timestamp: new Date(update.time).getTime()
    };

    this.orderBooks.set(symbol, updatedOrderBook);
    this.emit('orderbook', updatedOrderBook);
  }

  private updateOrderBookSide(
    existing: OrderBookEntry[], 
    price: string, 
    quantity: string
  ): OrderBookEntry[] {
    const result = existing.filter(entry => entry.price !== price);
    
    if (parseFloat(quantity) > 0) {
      result.push({ price, quantity });
    }
    
    return result;
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Coinbase] Max reconnection attempts reached');
      this.emit('error', { 
        exchange: ExchangeName.COINBASE, 
        error: new Error('Max reconnection attempts reached') 
      });
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`[Coinbase] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  getOrderBook(symbol: string): OrderBook | undefined {
    return this.orderBooks.get(symbol);
  }

  getAllOrderBooks(): Map<string, OrderBook> {
    return new Map(this.orderBooks);
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    console.log('[Coinbase] Disconnected');
  }
}
