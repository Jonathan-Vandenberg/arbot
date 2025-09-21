"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceWebSocketClient = void 0;
const ws_1 = __importDefault(require("ws"));
const shared_1 = require("@arbot/shared");
const base_exchange_1 = require("./base-exchange");
class BinanceWebSocketClient extends base_exchange_1.BaseExchange {
    ws = null;
    baseUrl = 'wss://stream.binance.com:9443/ws';
    restUrl = 'https://api.binance.com/api/v3';
    constructor(symbols = ['BTCUSDT', 'ETHUSDT']) {
        super('binance', symbols);
    }
    async getExchangeInfo() {
        try {
            const response = await fetch(`${this.restUrl}/exchangeInfo`);
            const data = await response.json();
            const tradingPairs = data.symbols
                .filter((symbol) => symbol.status === 'TRADING')
                .map((symbol) => ({
                symbol: symbol.symbol,
                baseAsset: symbol.baseAsset,
                quoteAsset: symbol.quoteAsset,
                normalizedSymbol: this.normalizeSymbol(symbol.baseAsset, symbol.quoteAsset),
                active: symbol.status === 'TRADING',
                minOrderSize: parseFloat(symbol.filters?.find((f) => f.filterType === 'LOT_SIZE')?.minQty || '0'),
                tickSize: parseFloat(symbol.filters?.find((f) => f.filterType === 'PRICE_FILTER')?.tickSize || '0')
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
        }
        catch (error) {
            console.error('[Binance] Failed to get exchange info:', error);
            throw error;
        }
    }
    subscribeToOrderBooks(symbols) {
        if (!this.ws)
            return;
        // Binance uses lowercase symbols for WebSocket
        const streams = symbols.map(symbol => `${symbol.toLowerCase()}@depth`).join('/');
        const wsUrl = `${this.baseUrl}/${streams}`;
        // Close existing connection and create new one with updated symbols
        if (this.ws.readyState === ws_1.default.OPEN) {
            this.ws.close();
        }
        this.ws = new ws_1.default(wsUrl);
        this.setupWebSocketHandlers();
    }
    async connect() {
        try {
            // Get initial snapshots for all symbols
            await this.initializeOrderBooks();
            // Create WebSocket connection
            const streams = this.symbols.map(symbol => `${symbol.toLowerCase()}@depth`).join('/');
            const wsUrl = `${this.baseUrl}/${streams}`;
            this.ws = new ws_1.default(wsUrl);
            this.setupWebSocketHandlers();
        }
        catch (error) {
            console.error('[Binance] Connection failed:', error);
            this.handleReconnect();
        }
    }
    setupWebSocketHandlers() {
        if (!this.ws)
            return;
        this.ws.on('open', () => {
            this.reconnectAttempts = 0;
            this.emit('connected', { exchange: shared_1.ExchangeName.BINANCE });
        });
        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleDepthUpdate(message);
            }
            catch (error) {
                console.error('[Binance] Error parsing message:', error);
            }
        });
        this.ws.on('close', () => {
            this.handleReconnect();
        });
        this.ws.on('error', (error) => {
            console.error('[Binance] WebSocket error:', error);
            this.emit('error', { exchange: shared_1.ExchangeName.BINANCE, error });
        });
    }
    async initializeOrderBooks() {
        console.log('[Binance] Initializing order book snapshots...');
        for (const symbol of this.symbols) {
            try {
                const response = await fetch(`${this.restUrl}/depth?symbol=${symbol}&limit=100`);
                const snapshot = await response.json();
                const orderBook = {
                    symbol,
                    exchange: shared_1.ExchangeName.BINANCE,
                    bids: snapshot.bids.map(([price, quantity]) => ({ price, quantity })),
                    asks: snapshot.asks.map(([price, quantity]) => ({ price, quantity })),
                    timestamp: Date.now(),
                    lastUpdateId: snapshot.lastUpdateId
                };
                this.orderBooks.set(symbol, orderBook);
                console.log(`[Binance] Initialized ${symbol} order book (${snapshot.bids.length} bids, ${snapshot.asks.length} asks)`);
            }
            catch (error) {
                console.error(`[Binance] Failed to initialize ${symbol} order book:`, error);
            }
        }
    }
    handleDepthUpdate(update) {
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
        const updatedOrderBook = {
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
    updateOrderBookSide(existing, updates, side) {
        const priceMap = new Map();
        // Add existing entries
        existing.forEach(entry => {
            priceMap.set(entry.price, entry.quantity);
        });
        // Apply updates
        updates.forEach(([price, quantity]) => {
            if (parseFloat(quantity) === 0) {
                priceMap.delete(price); // Remove if quantity is 0
            }
            else {
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
    disconnect() {
        this.cleanupReconnect();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
exports.BinanceWebSocketClient = BinanceWebSocketClient;
//# sourceMappingURL=binance.js.map