"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseExchange = void 0;
const events_1 = require("events");
class BaseExchange extends events_1.EventEmitter {
    exchangeId;
    symbols;
    orderBooks = new Map();
    tradingPairs = [];
    reconnectAttempts = 0;
    maxReconnectAttempts = 5;
    reconnectTimeout = null;
    constructor(exchangeId, symbols = []) {
        super();
        this.exchangeId = exchangeId;
        this.symbols = symbols;
    }
    // Common methods
    async discoverTradingPairs() {
        const exchangeInfo = await this.getExchangeInfo();
        this.tradingPairs = exchangeInfo.tradingPairs;
        return this.tradingPairs;
    }
    getTradingPairs() {
        return this.tradingPairs;
    }
    getOrderBook(symbol) {
        return this.orderBooks.get(symbol);
    }
    getAllOrderBooks() {
        return new Map(this.orderBooks);
    }
    // Symbol normalization utilities
    normalizeSymbol(baseAsset, quoteAsset) {
        // Normalize quote asset (USDT -> USD for consistency)
        const normalizedQuote = quoteAsset === 'USDT' ? 'USD' : quoteAsset;
        return `${baseAsset}${normalizedQuote}`;
    }
    parseSymbol(symbol) {
        // This will be overridden by each exchange based on their symbol format
        return null;
    }
    handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`[${this.exchangeId}] Max reconnection attempts reached`);
            this.emit('error', {
                exchange: this.exchangeId,
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
    cleanupReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }
}
exports.BaseExchange = BaseExchange;
//# sourceMappingURL=base-exchange.js.map