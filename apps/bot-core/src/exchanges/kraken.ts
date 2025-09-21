import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { OrderBook, ExchangeName } from '@arbot/shared';

interface KrakenSubscribeMessage {
  event: 'subscribe';
  pair: string[];
  subscription: {
    name: string;
    depth?: number;
  };
}


export class KrakenWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly wsUrl = 'wss://ws.kraken.com';
  private readonly restUrl = 'https://api.kraken.com';
  private orderBooks = new Map<string, OrderBook>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(private symbols: string[] = ['BTC/USD', 'ETH/USD']) {
    super();
  }

  async connect(): Promise<void> {
    try {
      // Get initial snapshots for all symbols
      await this.initializeOrderBooks();
      
      // Create WebSocket connection
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
        console.log(`[Kraken] WebSocket connected for symbols: ${this.symbols.join(', ')}`);
        this.subscribeToOrderBooks();
        this.reconnectAttempts = 0;
        this.emit('connected', { exchange: ExchangeName.KRAKEN });
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('[Kraken] Error parsing message:', error);
        }
      });

      this.ws.on('close', () => {
        this.handleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('[Kraken] WebSocket error:', error);
        this.emit('error', { exchange: ExchangeName.KRAKEN, error });
      });

    } catch (error) {
      console.error('[Kraken] Connection failed:', error);
      this.handleReconnect();
    }
  }

  private subscribeToOrderBooks(): void {
    if (!this.ws) return;

    const subscribeMessage: KrakenSubscribeMessage = {
      event: 'subscribe',
      pair: this.symbols,
      subscription: {
        name: 'book',
        depth: 100
      }
    };

    this.ws.send(JSON.stringify(subscribeMessage));
  }

  private async initializeOrderBooks(): Promise<void> {
    
    for (const symbol of this.symbols) {
      try {
        // Kraken uses different symbol format for REST API
        const krakenSymbol = symbol.replace('/', '');
        const response = await fetch(`${this.restUrl}/0/public/Depth?pair=${krakenSymbol}&count=100`);
        const data = await response.json();
        
        if (data.error && data.error.length > 0) {
          console.error(`[Kraken] API Error for ${symbol}:`, data.error);
          continue;
        }
        
        const pairData = Object.values(data.result)[0] as any;
        
        const orderBook: OrderBook = {
          symbol,
          exchange: ExchangeName.KRAKEN,
          bids: pairData.bids.slice(0, 50).map(([price, quantity]: [string, string]) => ({ price, quantity })),
          asks: pairData.asks.slice(0, 50).map(([price, quantity]: [string, string]) => ({ price, quantity })),
          timestamp: Date.now()
        };
        
        this.orderBooks.set(symbol, orderBook);
      } catch (error) {
        console.error(`[Kraken] Failed to initialize ${symbol} order book:`, error);
      }
    }
  }

  private handleMessage(message: any): void {
    if (Array.isArray(message)) {
      // Order book update format: [channelID, data, channelName, pair]
      if (message.length >= 4 && typeof message[1] === 'object') {
        this.handleOrderBookUpdate(message);
      }
    }
  }

  private handleOrderBookUpdate(message: any[]): void {
    const [_channelID, data, channelName, pair] = message;
    
    if (channelName !== 'book-100') return;
    
    const symbol = pair.replace('XBT', 'BTC'); // Kraken uses XBT for BTC
    const existingOrderBook = this.orderBooks.get(symbol);
    
    if (!existingOrderBook) {
      return;
    }

    let updatedBids = [...existingOrderBook.bids];
    let updatedAsks = [...existingOrderBook.asks];

    // Handle snapshot (full order book)
    if (data.bs && data.as) {
      updatedBids = data.bs.map(([price, quantity]: [string, string]) => ({ price, quantity }));
      updatedAsks = data.as.map(([price, quantity]: [string, string]) => ({ price, quantity }));
    } else {
      // Handle incremental updates
      if (data.b) {
        data.b.forEach(([price, quantity]: [string, string]) => {
          updatedBids = this.updateOrderBookSide(updatedBids, price, quantity);
        });
      }
      
      if (data.a) {
        data.a.forEach(([price, quantity]: [string, string]) => {
          updatedAsks = this.updateOrderBookSide(updatedAsks, price, quantity);
        });
      }
    }

    const updatedOrderBook: OrderBook = {
      ...existingOrderBook,
      bids: updatedBids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)), // Descending
      asks: updatedAsks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)), // Ascending
      timestamp: Date.now()
    };

    this.orderBooks.set(symbol, updatedOrderBook);
    this.emit('orderbook', updatedOrderBook);
  }

  private updateOrderBookSide(
    existing: { price: string; quantity: string }[], 
    price: string, 
    quantity: string
  ): { price: string; quantity: string }[] {
    const result = existing.filter(entry => entry.price !== price);
    
    if (parseFloat(quantity) > 0) {
      result.push({ price, quantity });
    }
    
    return result;
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Kraken] Max reconnection attempts reached');
      this.emit('error', { 
        exchange: ExchangeName.KRAKEN, 
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
  }
}
