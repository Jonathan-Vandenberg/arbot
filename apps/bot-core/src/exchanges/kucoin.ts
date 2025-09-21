import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { OrderBook, ExchangeName } from '@arbot/shared';

interface KuCoinSubscribeMessage {
  id: string;
  type: 'subscribe';
  topic: string;
  privateChannel: boolean;
  response: boolean;
}

interface KuCoinOrderBookUpdate {
  type: 'message';
  topic: string;
  subject: string;
  data: {
    symbol: string;
    sequenceStart: number;
    sequenceEnd: number;
    time: number;
    changes: {
      asks: [string, string, string][]; // [price, size, sequence]
      bids: [string, string, string][]; // [price, size, sequence]
    };
  };
}

export class KuCoinWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private wsUrl: string = '';
  private readonly restUrl = 'https://api.kucoin.com';
  private orderBooks = new Map<string, OrderBook>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private token: string = '';
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(private symbols: string[] = ['BTC-USDT', 'ETH-USDT']) {
    super();
  }

  async connect(): Promise<void> {
    try {
      // Get WebSocket connection details from KuCoin
      await this.getWebSocketInfo();
      
      // Get initial snapshots for all symbols
      await this.initializeOrderBooks();
      
      // Create WebSocket connection
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
        this.subscribeToOrderBooks();
        this.startPing();
        this.reconnectAttempts = 0;
        this.emit('connected', { exchange: ExchangeName.KUCOIN });
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('[KuCoin] Error parsing message:', error);
        }
      });

      this.ws.on('close', () => {
        this.stopPing();
        this.handleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('[KuCoin] WebSocket error:', error);
        this.emit('error', { exchange: ExchangeName.KUCOIN, error });
      });

    } catch (error) {
      console.error('[KuCoin] Connection failed:', error);
      this.handleReconnect();
    }
  }

  private async getWebSocketInfo(): Promise<void> {
    try {
      console.log('[KuCoin] Requesting WebSocket info from:', `${this.restUrl}/api/v1/bullet-public`);
      const response = await fetch(`${this.restUrl}/api/v1/bullet-public`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('[KuCoin] Response status:', response.status, response.statusText);
      const data = await response.json();
      console.log('[KuCoin] Response data:', JSON.stringify(data, null, 2));
      
      if (data.code !== '200000') {
        throw new Error(`KuCoin API error: ${data.msg || data.message || 'Unknown error'}`);
      }
      
      const instanceServer = data.data.instanceServers[0];
      this.token = data.data.token;
      this.wsUrl = `${instanceServer.endpoint}?token=${this.token}&[connectId=${Date.now()}]`;
      console.log('[KuCoin] WebSocket URL generated:', this.wsUrl);
    } catch (error) {
      console.error('[KuCoin] Failed to get WebSocket info:', error);
      throw error;
    }
  }

  private subscribeToOrderBooks(): void {
    if (!this.ws) return;

    const topics = this.symbols.map(symbol => `/market/level2:${symbol}`);
    
    topics.forEach((topic, index) => {
      const subscribeMessage: KuCoinSubscribeMessage = {
        id: `${Date.now()}_${index}`,
        type: 'subscribe',
        topic,
        privateChannel: false,
        response: true
      };
      
      this.ws!.send(JSON.stringify(subscribeMessage));
    });
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          id: Date.now().toString(),
          type: 'ping'
        }));
      }
    }, 20000); // Ping every 20 seconds
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private async initializeOrderBooks(): Promise<void> {
    for (const symbol of this.symbols) {
      try {
        const response = await fetch(`${this.restUrl}/api/v1/market/orderbook/level2_100?symbol=${symbol}`);
        const data = await response.json();
        
        if (data.code !== '200000') {
          console.error(`[KuCoin] API Error for ${symbol}:`, data.msg);
          continue;
        }
        
        const result = data.data;
        
        if (!result || !result.bids || !result.asks) {
          console.error(`[KuCoin] Invalid order book data for ${symbol}:`, result);
          continue;
        }
        
        const orderBook: OrderBook = {
          symbol,
          exchange: ExchangeName.KUCOIN,
          bids: result.bids.slice(0, 50).map(([price, quantity]: [string, string]) => ({ price, quantity })),
          asks: result.asks.slice(0, 50).map(([price, quantity]: [string, string]) => ({ price, quantity })),
          timestamp: Date.now()
        };
        
        this.orderBooks.set(symbol, orderBook);
      } catch (error) {
        console.error(`[KuCoin] Failed to initialize ${symbol} order book:`, error);
      }
    }
  }

  private handleMessage(message: any): void {
    if (message.type === 'message' && message.topic && message.topic.startsWith('/market/level2:')) {
      this.handleOrderBookUpdate(message as KuCoinOrderBookUpdate);
    } else if (message.type === 'pong') {
      // Pong response - connection is alive
    } else if (message.type === 'welcome') {
      console.log('[KuCoin] WebSocket connection established');
    } else if (message.type === 'ack') {
      console.log('[KuCoin] Subscription acknowledged:', message.id);
    }
  }

  private handleOrderBookUpdate(update: KuCoinOrderBookUpdate): void {
    const symbol = update.data.symbol;
    const existingOrderBook = this.orderBooks.get(symbol);
    
    if (!existingOrderBook) {
      return;
    }

    let updatedBids = [...existingOrderBook.bids];
    let updatedAsks = [...existingOrderBook.asks];

    // Apply bid updates (check if bids array exists in changes)
    if (update.data.changes.bids && Array.isArray(update.data.changes.bids)) {
      update.data.changes.bids.forEach(([price, quantity]) => {
        updatedBids = this.updateOrderBookSide(updatedBids, price, quantity);
      });
    }
    
    // Apply ask updates (check if asks array exists in changes)
    if (update.data.changes.asks && Array.isArray(update.data.changes.asks)) {
      update.data.changes.asks.forEach(([price, quantity]) => {
        updatedAsks = this.updateOrderBookSide(updatedAsks, price, quantity);
      });
    }

    const updatedOrderBook: OrderBook = {
      ...existingOrderBook,
      bids: updatedBids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)), // Descending
      asks: updatedAsks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)), // Ascending
      timestamp: update.data.time || Date.now()
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
      console.error('[KuCoin] Max reconnection attempts reached');
      this.emit('error', { 
        exchange: ExchangeName.KUCOIN, 
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
    this.stopPing();
    
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
