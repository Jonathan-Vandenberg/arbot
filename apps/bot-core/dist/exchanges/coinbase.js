"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoinbaseWebSocketClient = void 0;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const shared_1 = require("@arbot/shared");
class CoinbaseWebSocketClient extends events_1.EventEmitter {
    symbols;
    ws = null;
    wsUrl = 'wss://ws-feed.exchange.coinbase.com';
    restUrl = 'https://api.exchange.coinbase.com';
    orderBooks = new Map();
    reconnectAttempts = 0;
    maxReconnectAttempts = 5;
    reconnectTimeout = null;
    constructor(symbols = ['BTC-USD', 'ETH-USD']) {
        super();
        this.symbols = symbols;
    }
    async connect() {
        try {
            // Get initial snapshots for all symbols
            await this.initializeOrderBooks();
            // Create WebSocket connection
            this.ws = new ws_1.default(this.wsUrl);
            this.ws.on('open', () => {
                console.log(`[Coinbase] WebSocket connected for symbols: ${this.symbols.join(', ')}`);
                this.subscribeToOrderBooks();
                this.reconnectAttempts = 0;
                this.emit('connected', { exchange: shared_1.ExchangeName.COINBASE });
            });
            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                }
                catch (error) {
                    console.error('[Coinbase] Error parsing message:', error);
                }
            });
            this.ws.on('close', () => {
                console.log('[Coinbase] WebSocket closed');
                this.handleReconnect();
            });
            this.ws.on('error', (error) => {
                console.error('[Coinbase] WebSocket error:', error);
                this.emit('error', { exchange: shared_1.ExchangeName.COINBASE, error });
            });
        }
        catch (error) {
            console.error('[Coinbase] Connection failed:', error);
            this.handleReconnect();
        }
    }
    subscribeToOrderBooks() {
        if (!this.ws)
            return;
        const subscribeMessage = {
            type: 'subscribe',
            product_ids: this.symbols,
            channels: ['ticker'] // Use ticker instead of level2 (no auth required)
        };
        this.ws.send(JSON.stringify(subscribeMessage));
        console.log('[Coinbase] Subscribed to ticker updates');
    }
    async initializeOrderBooks() {
        console.log('[Coinbase] Initializing order book snapshots...');
        for (const symbol of this.symbols) {
            try {
                const response = await fetch(`${this.restUrl}/products/${symbol}/book?level=2`);
                const snapshot = await response.json();
                // Keep top 100 levels for accurate arbitrage analysis (matches Binance depth)
                const orderBook = {
                    symbol,
                    exchange: shared_1.ExchangeName.COINBASE,
                    bids: snapshot.bids.slice(0, 100).map(([price, quantity]) => ({ price, quantity })),
                    asks: snapshot.asks.slice(0, 100).map(([price, quantity]) => ({ price, quantity })),
                    timestamp: Date.now()
                };
                this.orderBooks.set(symbol, orderBook);
                console.log(`[Coinbase] Initialized ${symbol} order book (${orderBook.bids.length} bids, ${orderBook.asks.length} asks) - trimmed from ${snapshot.bids.length} total`);
            }
            catch (error) {
                console.error(`[Coinbase] Failed to initialize ${symbol} order book:`, error);
            }
        }
    }
    handleMessage(message) {
        switch (message.type) {
            case 'snapshot':
                this.handleSnapshot(message);
                break;
            case 'l2update':
                this.handleL2Update(message);
                break;
            case 'ticker':
                this.handleTicker(message);
                break;
            case 'subscriptions':
                // Subscription confirmed - no logging needed
                break;
            default:
                // Unknown message type - no logging needed
                break;
        }
    }
    handleSnapshot(snapshot) {
        const orderBook = {
            symbol: snapshot.product_id,
            exchange: shared_1.ExchangeName.COINBASE,
            bids: snapshot.bids.map(([price, quantity]) => ({ price, quantity })),
            asks: snapshot.asks.map(([price, quantity]) => ({ price, quantity })),
            timestamp: new Date(snapshot.time || Date.now()).getTime()
        };
        this.orderBooks.set(snapshot.product_id, orderBook);
        this.emit('orderbook', orderBook);
    }
    handleTicker(ticker) {
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
    handleL2Update(update) {
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
            }
            else if (side === 'sell') {
                updatedAsks = this.updateOrderBookSide(updatedAsks, price, quantity);
            }
        });
        const updatedOrderBook = {
            ...existingOrderBook,
            bids: updatedBids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)), // Descending
            asks: updatedAsks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)), // Ascending
            timestamp: new Date(update.time).getTime()
        };
        this.orderBooks.set(symbol, updatedOrderBook);
        this.emit('orderbook', updatedOrderBook);
    }
    updateOrderBookSide(existing, price, quantity) {
        const result = existing.filter(entry => entry.price !== price);
        if (parseFloat(quantity) > 0) {
            result.push({ price, quantity });
        }
        return result;
    }
    handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[Coinbase] Max reconnection attempts reached');
            this.emit('error', {
                exchange: shared_1.ExchangeName.COINBASE,
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
    getOrderBook(symbol) {
        return this.orderBooks.get(symbol);
    }
    getAllOrderBooks() {
        return new Map(this.orderBooks);
    }
    disconnect() {
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
exports.CoinbaseWebSocketClient = CoinbaseWebSocketClient;
//# sourceMappingURL=coinbase.js.map