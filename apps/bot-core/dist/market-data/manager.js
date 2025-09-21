"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketDataManager = void 0;
const events_1 = require("events");
const redis_1 = require("redis");
const binance_1 = require("../exchanges/binance");
const coinbase_1 = require("../exchanges/coinbase");
const kraken_1 = require("../exchanges/kraken");
const opportunity_detector_1 = require("../arbitrage/opportunity-detector");
class MarketDataManager extends events_1.EventEmitter {
    binanceClient;
    coinbaseClient;
    krakenClient;
    redisClient;
    opportunityDetector;
    isRunning = false;
    constructor(_symbols = ['BTCUSDT', 'BTC-USD', 'BTC/USD', 'ETHUSDT', 'ETH-USD', 'ETH/USD']) {
        super();
        // Initialize exchange clients with both BTC and ETH pairs
        this.binanceClient = new binance_1.BinanceWebSocketClient(['BTCUSDT', 'ETHUSDT']); // Binance format
        this.coinbaseClient = new coinbase_1.CoinbaseWebSocketClient(['BTC-USD', 'ETH-USD']); // Coinbase format  
        this.krakenClient = new kraken_1.KrakenWebSocketClient(['BTC/USD', 'ETH/USD']); // Kraken format
        // Initialize Redis client
        this.redisClient = (0, redis_1.createClient)({
            url: process.env['REDIS_URL'] || 'redis://localhost:6379'
        });
        // Initialize opportunity detector
        this.opportunityDetector = new opportunity_detector_1.OpportunityDetector();
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        // Binance events
        this.binanceClient.on('connected', (data) => {
            this.emit('exchange_connected', data);
        });
        this.binanceClient.on('orderbook', (orderBook) => {
            this.handleOrderBookUpdate(orderBook);
        });
        this.binanceClient.on('error', (error) => {
            console.error(`❌ ${error.exchange} error:`, error.error);
            this.emit('exchange_error', error);
        });
        // Coinbase events
        this.coinbaseClient.on('connected', (data) => {
            this.emit('exchange_connected', data);
        });
        this.coinbaseClient.on('orderbook', (orderBook) => {
            this.handleOrderBookUpdate(orderBook);
        });
        this.coinbaseClient.on('error', (error) => {
            console.error(`❌ ${error.exchange} error:`, error.error);
            this.emit('exchange_error', error);
        });
        // Kraken events
        this.krakenClient.on('connected', (data) => {
            this.emit('exchange_connected', data);
        });
        this.krakenClient.on('orderbook', (orderBook) => {
            this.handleOrderBookUpdate(orderBook);
        });
        this.krakenClient.on('error', (error) => {
            console.error(`❌ ${error.exchange} error:`, error.error);
            this.emit('exchange_error', error);
        });
        // Opportunity detector events
        this.opportunityDetector.on('opportunity_detected', (opportunity) => {
            this.emit('arbitrage_opportunity', opportunity);
        });
    }
    async start() {
        if (this.isRunning) {
            console.log('⚠️  Market data manager is already running');
            return;
        }
        try {
            // Connect to Redis
            await this.redisClient.connect();
            // Start exchange connections
            await Promise.all([
                this.binanceClient.connect(),
                this.coinbaseClient.connect(),
                this.krakenClient.connect()
            ]);
            this.isRunning = true;
            this.emit('started');
        }
        catch (error) {
            console.error('❌ Failed to start Market Data Manager:', error);
            this.emit('error', error);
            throw error;
        }
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
            // Skip logging individual order book updates to reduce noise
        }
        catch (error) {
            console.error('❌ Error handling order book update:', error);
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
    getExchangeOrderBooks() {
        return {
            binance: this.binanceClient.getAllOrderBooks(),
            coinbase: this.coinbaseClient.getAllOrderBooks()
        };
    }
    async stop() {
        if (!this.isRunning) {
            return;
        }
        // Disconnect exchange clients
        this.binanceClient.disconnect();
        this.coinbaseClient.disconnect();
        this.krakenClient.disconnect();
        // Disconnect Redis
        await this.redisClient.disconnect();
        this.isRunning = false;
        this.emit('stopped');
    }
    isManagerRunning() {
        return this.isRunning;
    }
}
exports.MarketDataManager = MarketDataManager;
//# sourceMappingURL=manager.js.map