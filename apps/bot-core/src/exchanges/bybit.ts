import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { OrderBook, ExchangeName } from '@arbot/shared';

interface BybitSubscribeMessage {
  op: 'subscribe';
  args: string[];
}

interface BybitOrderBookUpdate {
  topic: string;
  type: string;
  data: {
    s: string; // symbol
    b: [string, string][]; // bids [price, size]
    a: [string, string][]; // asks [price, size]
    u: number; // update id
    seq: number; // sequence
  };
  cts: number; // cross sequence
}

export class BybitWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly wsUrl = 'wss://stream.bybit.com/v5/public/spot';
  private readonly restUrl = 'https://api.bybit.com';
  private orderBooks = new Map<string, OrderBook>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(private symbols: string[] = ['BTCUSDT', 'ETHUSDT']) {
    super();
  }

  async connect(): Promise<void> {
    try {
      // Get initial snapshots for all symbols
      await this.initializeOrderBooks();
      
      // Create WebSocket connection
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
        this.subscribeToOrderBooks();
        this.reconnectAttempts = 0;
        this.emit('connected', { exchange: ExchangeName.BYBIT });
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('[Bybit] Error parsing message:', error);
        }
      });

      this.ws.on('close', () => {
        this.handleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('[Bybit] WebSocket error:', error);
        this.emit('error', { exchange: ExchangeName.BYBIT, error });
      });

    } catch (error) {
      console.error('[Bybit] Connection failed:', error);
      this.handleReconnect();
    }
  }

  private subscribeToOrderBooks(): void {
    if (!this.ws) return;

    const topics = this.symbols.map(symbol => `orderbook.50.${symbol}`);
    const subscribeMessage: BybitSubscribeMessage = {
      op: 'subscribe',
      args: topics
    };

    this.ws.send(JSON.stringify(subscribeMessage));
  }

  private async initializeOrderBooks(): Promise<void> {
    for (const symbol of this.symbols) {
      try {
        const response = await fetch(`${this.restUrl}/v5/market/orderbook?category=spot&symbol=${symbol}&limit=50`);
        const data = await response.json();
        
        if (data.retCode !== 0) {
          console.error(`[Bybit] API Error for ${symbol}:`, data.retMsg);
          continue;
        }
        
        const result = data.result;
        
        const orderBook: OrderBook = {
          symbol,
          exchange: ExchangeName.BYBIT,
          bids: result.b.slice(0, 50).map(([price, quantity]: [string, string]) => ({ price, quantity })),
          asks: result.a.slice(0, 50).map(([price, quantity]: [string, string]) => ({ price, quantity })),
          timestamp: Date.now()
        };
        
        this.orderBooks.set(symbol, orderBook);
      } catch (error) {
        console.error(`[Bybit] Failed to initialize ${symbol} order book:`, error);
      }
    }
  }

  private handleMessage(message: any): void {
    if (message.topic && message.topic.startsWith('orderbook')) {
      this.handleOrderBookUpdate(message as BybitOrderBookUpdate);
    } else if (message.success) {
      console.log('[Bybit] Subscription successful');
    }
  }

  private handleOrderBookUpdate(update: BybitOrderBookUpdate): void {
    const symbol = update.data.s;
    const existingOrderBook = this.orderBooks.get(symbol);
    
    if (!existingOrderBook) {
      return;
    }

    let updatedBids = [...existingOrderBook.bids];
    let updatedAsks = [...existingOrderBook.asks];

    // Handle snapshot or incremental updates
    if (update.type === 'snapshot') {
      updatedBids = update.data.b.map(([price, quantity]) => ({ price, quantity }));
      updatedAsks = update.data.a.map(([price, quantity]) => ({ price, quantity }));
    } else {
      // Delta updates
      update.data.b.forEach(([price, quantity]) => {
        updatedBids = this.updateOrderBookSide(updatedBids, price, quantity);
      });
      
      update.data.a.forEach(([price, quantity]) => {
        updatedAsks = this.updateOrderBookSide(updatedAsks, price, quantity);
      });
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
      console.error('[Bybit] Max reconnection attempts reached');
      this.emit('error', { 
        exchange: ExchangeName.BYBIT, 
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
