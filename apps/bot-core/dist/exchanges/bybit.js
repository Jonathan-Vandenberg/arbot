"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BybitWebSocketClient = void 0;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const shared_1 = require("@arbot/shared");
class BybitWebSocketClient extends events_1.EventEmitter {
    symbols;
    ws = null;
    wsUrl = 'wss://stream.bybit.com/v5/public/spot';
    restUrl = 'https://api.bybit.com';
    orderBooks = new Map();
    reconnectAttempts = 0;
    maxReconnectAttempts = 5;
    reconnectTimeout = null;
    constructor(symbols = ['BTCUSDT', 'ETHUSDT']) {
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
                this.subscribeToOrderBooks();
                this.reconnectAttempts = 0;
                this.emit('connected', { exchange: shared_1.ExchangeName.BYBIT });
            });
            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                }
                catch (error) {
                    console.error('[Bybit] Error parsing message:', error);
                }
            });
            this.ws.on('close', () => {
                this.handleReconnect();
            });
            this.ws.on('error', (error) => {
                console.error('[Bybit] WebSocket error:', error);
                this.emit('error', { exchange: shared_1.ExchangeName.BYBIT, error });
            });
        }
        catch (error) {
            console.error('[Bybit] Connection failed:', error);
            this.handleReconnect();
        }
    }
    subscribeToOrderBooks() {
        if (!this.ws)
            return;
        const topics = this.symbols.map(symbol => `orderbook.50.${symbol}`);
        const subscribeMessage = {
            op: 'subscribe',
            args: topics
        };
        this.ws.send(JSON.stringify(subscribeMessage));
    }
    async initializeOrderBooks() {
        for (const symbol of this.symbols) {
            try {
                const response = await fetch(`${this.restUrl}/v5/market/orderbook?category=spot&symbol=${symbol}&limit=100`);
                const data = await response.json();
                if (data.retCode !== 0) {
                    console.error(`[Bybit] API Error for ${symbol}:`, data.retMsg);
                    continue;
                }
                const result = data.result;
                const orderBook = {
                    symbol,
                    exchange: shared_1.ExchangeName.BYBIT,
                    bids: result.b.slice(0, 100).map(([price, quantity]) => ({ price, quantity })),
                    asks: result.a.slice(0, 100).map(([price, quantity]) => ({ price, quantity })),
                    timestamp: Date.now()
                };
                this.orderBooks.set(symbol, orderBook);
            }
            catch (error) {
                console.error(`[Bybit] Failed to initialize ${symbol} order book:`, error);
            }
        }
    }
    handleMessage(message) {
        if (message.topic && message.topic.startsWith('orderbook')) {
            this.handleOrderBookUpdate(message);
        }
    }
    handleOrderBookUpdate(update) {
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
        }
        else {
            // Delta updates
            update.data.b.forEach(([price, quantity]) => {
                updatedBids = this.updateOrderBookSide(updatedBids, price, quantity);
            });
            update.data.a.forEach(([price, quantity]) => {
                updatedAsks = this.updateOrderBookSide(updatedAsks, price, quantity);
            });
        }
        const updatedOrderBook = {
            ...existingOrderBook,
            bids: updatedBids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)), // Descending
            asks: updatedAsks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)), // Ascending
            timestamp: Date.now()
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
            console.error('[Bybit] Max reconnection attempts reached');
            this.emit('error', {
                exchange: shared_1.ExchangeName.BYBIT,
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
    }
}
exports.BybitWebSocketClient = BybitWebSocketClient;
//# sourceMappingURL=bybit.js.map