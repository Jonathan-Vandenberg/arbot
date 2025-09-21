"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicMarketDataManager = void 0;
const events_1 = require("events");
const redis_1 = require("redis");
const binance_1 = require("../exchanges/binance");
const coinbase_1 = require("../exchanges/coinbase");
const kraken_1 = require("../exchanges/kraken");
const bybit_1 = require("../exchanges/bybit");
const kucoin_1 = require("../exchanges/kucoin");
const gemini_1 = require("../exchanges/gemini");
const opportunity_detector_1 = require("../arbitrage/opportunity-detector");
class DynamicMarketDataManager extends events_1.EventEmitter {
    redisClient;
    subscriberClient;
    opportunityDetector;
    exchangeClients = new Map();
    isRunning = false;
    currentConfig;
    constructor() {
        super();
        // Initialize Redis clients
        this.redisClient = (0, redis_1.createClient)({
            url: process.env['REDIS_URL'] || 'redis://localhost:6379'
        });
        this.subscriberClient = (0, redis_1.createClient)({
            url: process.env['REDIS_URL'] || 'redis://localhost:6379'
        });
        // Initialize opportunity detector
        this.opportunityDetector = new opportunity_detector_1.OpportunityDetector();
        // Default configuration
        this.currentConfig = {
            exchanges: ['binance', 'coinbase', 'kraken'],
            symbols: ['BTCUSD', 'ETHUSD'],
            minProfitPercent: 0.1,
            tradeAmount: 0.01,
            isActive: true
        };
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        // Opportunity detector events
        this.opportunityDetector.on('opportunity_detected', (opportunity) => {
            this.emit('arbitrage_opportunity', opportunity);
        });
    }
    async start() {
        if (this.isRunning) {
            return;
        }
        try {
            // Connect to Redis
            await this.redisClient.connect();
            await this.subscriberClient.connect();
            // Subscribe to config updates
            await this.subscriberClient.subscribe('bot:config:update', (message) => {
                try {
                    const newConfig = JSON.parse(message);
                    this.updateConfiguration(newConfig);
                }
                catch (error) {
                    console.error('Error parsing config update:', error);
                }
            });
            // Load initial configuration
            await this.loadConfiguration();
            // Start with current configuration
            await this.startExchangeConnections();
            // Update bot status
            await this.updateBotStatus();
            this.isRunning = true;
            this.emit('started');
        }
        catch (error) {
            console.error('❌ Failed to start Dynamic Market Data Manager:', error);
            this.emit('error', error);
            throw error;
        }
    }
    async loadConfiguration() {
        try {
            const configStr = await this.redisClient.get('bot:config');
            if (configStr) {
                this.currentConfig = JSON.parse(configStr);
            }
            // Update opportunity detector config
            this.opportunityDetector.updateConfig({
                minProfitPercent: this.currentConfig.minProfitPercent
            });
        }
        catch (error) {
            console.error('Error loading configuration:', error);
        }
    }
    async updateConfiguration(newConfig) {
        const oldConfig = { ...this.currentConfig };
        this.currentConfig = newConfig;
        // Update opportunity detector
        this.opportunityDetector.updateConfig({
            minProfitPercent: newConfig.minProfitPercent
        });
        // Check if exchanges or symbols changed
        const exchangesChanged = JSON.stringify(oldConfig.exchanges.sort()) !== JSON.stringify(newConfig.exchanges.sort());
        const symbolsChanged = JSON.stringify(oldConfig.symbols.sort()) !== JSON.stringify(newConfig.symbols.sort());
        if (exchangesChanged || symbolsChanged) {
            console.log('🔄 Configuration changed, restarting connections...');
            await this.restartExchangeConnections();
        }
        await this.updateBotStatus();
    }
    async startExchangeConnections() {
        const promises = [];
        for (const exchangeId of this.currentConfig.exchanges) {
            if (!this.currentConfig.isActive)
                continue;
            const client = this.createExchangeClient(exchangeId);
            if (client) {
                this.exchangeClients.set(exchangeId, client);
                this.setupExchangeEventHandlers(client, exchangeId);
                promises.push(client.connect());
            }
        }
        await Promise.all(promises);
    }
    async restartExchangeConnections() {
        // Disconnect all existing clients
        for (const [_exchangeId, client] of this.exchangeClients) {
            client.disconnect();
        }
        this.exchangeClients.clear();
        // Start new connections
        await this.startExchangeConnections();
    }
    createExchangeClient(exchangeId) {
        const symbols = this.getSymbolsForExchange(exchangeId);
        switch (exchangeId) {
            case 'binance':
                return new binance_1.BinanceWebSocketClient(symbols);
            case 'coinbase':
                return new coinbase_1.CoinbaseWebSocketClient(symbols);
            case 'kraken':
                return new kraken_1.KrakenWebSocketClient(symbols);
            case 'bybit':
                return new bybit_1.BybitWebSocketClient(symbols);
            case 'kucoin':
                return new kucoin_1.KuCoinWebSocketClient(symbols);
            case 'gemini':
                return new gemini_1.GeminiWebSocketClient(symbols);
            default:
                console.warn(`Unknown exchange: ${exchangeId}`);
                return null;
        }
    }
    getSymbolsForExchange(exchangeId) {
        return this.currentConfig.symbols.map(symbol => {
            switch (exchangeId) {
                case 'binance':
                    return symbol.replace('USD', 'USDT');
                case 'coinbase':
                    return symbol.replace('USD', '-USD');
                case 'kraken':
                    return symbol.replace('USD', '/USD');
                case 'bybit':
                    return symbol.replace('USD', 'USDT');
                case 'kucoin':
                    return symbol.replace('USD', '-USDT');
                case 'gemini':
                    return symbol.toLowerCase();
                default:
                    return symbol;
            }
        });
    }
    setupExchangeEventHandlers(client, _exchangeId) {
        client.on('connected', (data) => {
            this.emit('exchange_connected', data);
            this.updateBotStatus();
        });
        client.on('orderbook', (orderBook) => {
            this.handleOrderBookUpdate(orderBook);
        });
        client.on('error', (error) => {
            console.error(`❌ ${error.exchange} error:`, error.error);
            this.emit('exchange_error', error);
        });
    }
    async handleOrderBookUpdate(orderBook) {
        try {
            // Cache in Redis with TTL of 10 seconds
            const key = `orderbook:${orderBook.exchange}:${orderBook.symbol}`;
            await this.redisClient.setEx(key, 10, JSON.stringify(orderBook));
            // Feed to opportunity detector
            this.opportunityDetector.updateOrderBook(orderBook);
            // Emit for real-time processing
            this.emit('orderbook_update', orderBook);
        }
        catch (error) {
            console.error('❌ Error handling order book update:', error);
        }
    }
    async updateBotStatus() {
        try {
            const status = {
                isRunning: this.isRunning && this.currentConfig.isActive,
                connectedExchanges: Array.from(this.exchangeClients.keys()),
                lastOpportunity: null, // This would be updated by opportunity detector
                uptime: this.isRunning ? Date.now() : 0,
                config: this.currentConfig
            };
            await this.redisClient.set('bot:status', JSON.stringify(status));
        }
        catch (error) {
            console.error('Error updating bot status:', error);
        }
    }
    async getOrderBook(exchange, symbol) {
        try {
            const key = `orderbook:${exchange}:${symbol}`;
            const data = await this.redisClient.get(key);
            return data ? JSON.parse(data) : null;
        }
        catch (error) {
            console.error('❌ Error retrieving order book from Redis:', error);
            return null;
        }
    }
    async getAllOrderBooks() {
        try {
            const keys = await this.redisClient.keys('orderbook:*');
            const orderBooks = [];
            for (const key of keys) {
                const data = await this.redisClient.get(key);
                if (data) {
                    orderBooks.push(JSON.parse(data));
                }
            }
            return orderBooks;
        }
        catch (error) {
            console.error('❌ Error retrieving all order books:', error);
            return [];
        }
    }
    async stop() {
        if (!this.isRunning) {
            return;
        }
        // Disconnect all exchange clients
        for (const [_exchangeId, client] of this.exchangeClients) {
            client.disconnect();
        }
        this.exchangeClients.clear();
        // Disconnect Redis
        await this.redisClient.disconnect();
        await this.subscriberClient.disconnect();
        this.isRunning = false;
        await this.updateBotStatus();
        this.emit('stopped');
    }
    isManagerRunning() {
        return this.isRunning;
    }
    getCurrentConfig() {
        return { ...this.currentConfig };
    }
}
exports.DynamicMarketDataManager = DynamicMarketDataManager;
//# sourceMappingURL=dynamic-manager.js.map