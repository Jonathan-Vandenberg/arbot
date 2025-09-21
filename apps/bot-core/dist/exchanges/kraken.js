"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KrakenWebSocketClient = void 0;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const shared_1 = require("@arbot/shared");
class KrakenWebSocketClient extends events_1.EventEmitter {
    symbols;
    ws = null;
    wsUrl = 'wss://ws.kraken.com';
    restUrl = 'https://api.kraken.com';
    orderBooks = new Map();
    reconnectAttempts = 0;
    maxReconnectAttempts = 5;
    reconnectTimeout = null;
    constructor(symbols = ['BTC/USD', 'ETH/USD']) {
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
                console.log(`[Kraken] WebSocket connected for symbols: ${this.symbols.join(', ')}`);
                this.subscribeToOrderBooks();
                this.reconnectAttempts = 0;
                this.emit('connected', { exchange: shared_1.ExchangeName.KRAKEN });
            });
            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                }
                catch (error) {
                    console.error('[Kraken] Error parsing message:', error);
                }
            });
            this.ws.on('close', () => {
                this.handleReconnect();
            });
            this.ws.on('error', (error) => {
                console.error('[Kraken] WebSocket error:', error);
                this.emit('error', { exchange: shared_1.ExchangeName.KRAKEN, error });
            });
        }
        catch (error) {
            console.error('[Kraken] Connection failed:', error);
            this.handleReconnect();
        }
    }
    subscribeToOrderBooks() {
        if (!this.ws)
            return;
        const subscribeMessage = {
            event: 'subscribe',
            pair: this.symbols,
            subscription: {
                name: 'book',
                depth: 100
            }
        };
        this.ws.send(JSON.stringify(subscribeMessage));
    }
    async initializeOrderBooks() {
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
                const pairData = Object.values(data.result)[0];
                const orderBook = {
                    symbol,
                    exchange: shared_1.ExchangeName.KRAKEN,
                    bids: pairData.bids.slice(0, 100).map(([price, quantity]) => ({ price, quantity })),
                    asks: pairData.asks.slice(0, 100).map(([price, quantity]) => ({ price, quantity })),
                    timestamp: Date.now()
                };
                this.orderBooks.set(symbol, orderBook);
            }
            catch (error) {
                console.error(`[Kraken] Failed to initialize ${symbol} order book:`, error);
            }
        }
    }
    handleMessage(message) {
        if (Array.isArray(message)) {
            // Order book update format: [channelID, data, channelName, pair]
            if (message.length >= 4 && typeof message[1] === 'object') {
                this.handleOrderBookUpdate(message);
            }
        }
    }
    handleOrderBookUpdate(message) {
        const [_channelID, data, channelName, pair] = message;
        if (channelName !== 'book-100')
            return;
        const symbol = pair.replace('XBT', 'BTC'); // Kraken uses XBT for BTC
        const existingOrderBook = this.orderBooks.get(symbol);
        if (!existingOrderBook) {
            return;
        }
        let updatedBids = [...existingOrderBook.bids];
        let updatedAsks = [...existingOrderBook.asks];
        // Handle snapshot (full order book)
        if (data.bs && data.as) {
            updatedBids = data.bs.map(([price, quantity]) => ({ price, quantity }));
            updatedAsks = data.as.map(([price, quantity]) => ({ price, quantity }));
        }
        else {
            // Handle incremental updates
            if (data.b) {
                data.b.forEach(([price, quantity]) => {
                    updatedBids = this.updateOrderBookSide(updatedBids, price, quantity);
                });
            }
            if (data.a) {
                data.a.forEach(([price, quantity]) => {
                    updatedAsks = this.updateOrderBookSide(updatedAsks, price, quantity);
                });
            }
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
            console.error('[Kraken] Max reconnection attempts reached');
            this.emit('error', {
                exchange: shared_1.ExchangeName.KRAKEN,
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
exports.KrakenWebSocketClient = KrakenWebSocketClient;
//# sourceMappingURL=kraken.js.map