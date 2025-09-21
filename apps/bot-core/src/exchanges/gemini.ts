import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { OrderBook, ExchangeName } from '@arbot/shared';

interface GeminiOrderBookUpdate {
  type: 'update';
  eventId: number;
  events: Array<{
    type: 'change';
    side: 'bid' | 'ask';
    price: string;
    remaining: string;
    delta: string;
    reason: string;
  }>;
  timestamp: number;
  timestampms: number;
}

export class GeminiWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly wsUrl = 'wss://api.gemini.com/v1/marketdata';
  private readonly restUrl = 'https://api.gemini.com/v1';
  private orderBooks = new Map<string, OrderBook>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(private symbols: string[] = ['btcusd', 'ethusd']) {
    super();
  }

  async connect(): Promise<void> {
    try {
      // Get initial snapshots for all symbols
      await this.initializeOrderBooks();
      
      // Create WebSocket connections (Gemini requires one connection per symbol)
      await this.connectToSymbols();
      
      this.reconnectAttempts = 0;
      this.emit('connected', { exchange: ExchangeName.GEMINI });

    } catch (error) {
      console.error('[Gemini] Connection failed:', error);
      this.handleReconnect();
    }
  }

  private async connectToSymbols(): Promise<void> {
    // Connect to all symbols (Gemini requires one connection per symbol)
    for (const symbol of this.symbols) {
      await this.connectToSymbol(symbol);
    }
  }

  private async connectToSymbol(symbol: string): Promise<void> {
    const wsUrl = `${this.wsUrl}/${symbol}`;
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log(`[Gemini] Connected to ${symbol}`);
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message, symbol);
      } catch (error) {
        console.error(`[Gemini] Error parsing message for ${symbol}:`, error);
      }
    });

    ws.on('close', () => {
      console.log(`[Gemini] Connection closed for ${symbol}`);
      this.handleReconnect();
    });

    ws.on('error', (error) => {
      console.error(`[Gemini] WebSocket error for ${symbol}:`, error);
      this.emit('error', { exchange: ExchangeName.GEMINI, error });
    });

    // Store the connection (you might want to track multiple connections)
    if (!this.ws) {
      this.ws = ws; // Keep reference to first connection for disconnect
    }
  }

  private async initializeOrderBooks(): Promise<void> {
    for (const symbol of this.symbols) {
      try {
        const response = await fetch(`${this.restUrl}/book/${symbol}`);
        const data = await response.json();
        
        if (data.message) {
          console.error(`[Gemini] API Error for ${symbol}:`, data.message);
          continue;
        }
        
        const orderBook: OrderBook = {
          symbol: symbol.toUpperCase(),
          exchange: ExchangeName.GEMINI,
          bids: data.bids.slice(0, 50).map((bid: any) => ({ 
            price: bid.price, 
            quantity: bid.amount 
          })),
          asks: data.asks.slice(0, 50).map((ask: any) => ({ 
            price: ask.price, 
            quantity: ask.amount 
          })),
          timestamp: Date.now()
        };
        
        this.orderBooks.set(symbol.toUpperCase(), orderBook);
      } catch (error) {
        console.error(`[Gemini] Failed to initialize ${symbol} order book:`, error);
      }
    }
  }

  private handleMessage(message: any, symbol: string): void {
    if (message.type === 'update') {
      this.handleOrderBookUpdate(message as GeminiOrderBookUpdate, symbol);
    }
  }

  private handleOrderBookUpdate(update: GeminiOrderBookUpdate, symbol: string): void {
    const upperSymbol = symbol.toUpperCase();
    const existingOrderBook = this.orderBooks.get(upperSymbol);
    
    if (!existingOrderBook) {
      return;
    }

    let updatedBids = [...existingOrderBook.bids];
    let updatedAsks = [...existingOrderBook.asks];

    // Apply all events in the update
    update.events.forEach(event => {
      if (event.type === 'change') {
        if (event.side === 'bid') {
          updatedBids = this.updateOrderBookSide(updatedBids, event.price, event.remaining);
        } else if (event.side === 'ask') {
          updatedAsks = this.updateOrderBookSide(updatedAsks, event.price, event.remaining);
        }
      }
    });

    const updatedOrderBook: OrderBook = {
      ...existingOrderBook,
      bids: updatedBids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)), // Descending
      asks: updatedAsks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)), // Ascending
      timestamp: update.timestampms
    };

    this.orderBooks.set(upperSymbol, updatedOrderBook);
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
      console.error('[Gemini] Max reconnection attempts reached');
      this.emit('error', { 
        exchange: ExchangeName.GEMINI, 
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
    return this.orderBooks.get(symbol.toUpperCase());
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
