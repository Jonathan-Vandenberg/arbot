"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiWebSocketClient = void 0;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const shared_1 = require("@arbot/shared");
class GeminiWebSocketClient extends events_1.EventEmitter {
    symbols;
    ws = null;
    wsUrl = 'wss://api.gemini.com/v1/marketdata';
    restUrl = 'https://api.gemini.com/v1';
    orderBooks = new Map();
    reconnectAttempts = 0;
    maxReconnectAttempts = 5;
    reconnectTimeout = null;
    constructor(symbols = ['btcusd', 'ethusd']) {
        super();
        this.symbols = symbols;
    }
    async connect() {
        try {
            // Get initial snapshots for all symbols
            await this.initializeOrderBooks();
            // Create WebSocket connections (Gemini requires one connection per symbol)
            await this.connectToSymbols();
            this.reconnectAttempts = 0;
            this.emit('connected', { exchange: shared_1.ExchangeName.GEMINI });
        }
        catch (error) {
            console.error('[Gemini] Connection failed:', error);
            this.handleReconnect();
        }
    }
    async connectToSymbols() {
        // For simplicity, we'll connect to the first symbol
        // In production, you might want multiple connections
        const symbol = this.symbols[0];
        if (!symbol)
            return;
        const wsUrl = `${this.wsUrl}/${symbol}`;
        this.ws = new ws_1.default(wsUrl);
        this.ws.on('open', () => {
            // Gemini doesn't require subscription messages
        });
        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(message, symbol);
            }
            catch (error) {
                console.error('[Gemini] Error parsing message:', error);
            }
        });
        this.ws.on('close', () => {
            this.handleReconnect();
        });
        this.ws.on('error', (error) => {
            console.error('[Gemini] WebSocket error:', error);
            this.emit('error', { exchange: shared_1.ExchangeName.GEMINI, error });
        });
    }
    async initializeOrderBooks() {
        for (const symbol of this.symbols) {
            try {
                const response = await fetch(`${this.restUrl}/book/${symbol}`);
                const data = await response.json();
                if (data.message) {
                    console.error(`[Gemini] API Error for ${symbol}:`, data.message);
                    continue;
                }
                const orderBook = {
                    symbol: symbol.toUpperCase(),
                    exchange: shared_1.ExchangeName.GEMINI,
                    bids: data.bids.slice(0, 100).map((bid) => ({
                        price: bid.price,
                        quantity: bid.amount
                    })),
                    asks: data.asks.slice(0, 100).map((ask) => ({
                        price: ask.price,
                        quantity: ask.amount
                    })),
                    timestamp: Date.now()
                };
                this.orderBooks.set(symbol.toUpperCase(), orderBook);
            }
            catch (error) {
                console.error(`[Gemini] Failed to initialize ${symbol} order book:`, error);
            }
        }
    }
    handleMessage(message, symbol) {
        if (message.type === 'update') {
            this.handleOrderBookUpdate(message, symbol);
        }
    }
    handleOrderBookUpdate(update, symbol) {
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
                }
                else if (event.side === 'ask') {
                    updatedAsks = this.updateOrderBookSide(updatedAsks, event.price, event.remaining);
                }
            }
        });
        const updatedOrderBook = {
            ...existingOrderBook,
            bids: updatedBids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)), // Descending
            asks: updatedAsks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)), // Ascending
            timestamp: update.timestampms
        };
        this.orderBooks.set(upperSymbol, updatedOrderBook);
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
            console.error('[Gemini] Max reconnection attempts reached');
            this.emit('error', {
                exchange: shared_1.ExchangeName.GEMINI,
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
        return this.orderBooks.get(symbol.toUpperCase());
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
exports.GeminiWebSocketClient = GeminiWebSocketClient;
//# sourceMappingURL=gemini.js.map