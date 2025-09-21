"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const redis_1 = require("redis");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env['PORT'] || 4000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Redis client
const redisClient = (0, redis_1.createClient)({
    url: process.env['REDIS_URL'] || 'redis://localhost:6379'
});
// Connect to Redis
redisClient.connect().catch(console.error);
// Routes
app.get("/", (_req, res) => {
    res.json({
        message: "🚀 Arbot API is alive!",
        timestamp: new Date().toISOString(),
        services: {
            redis: redisClient.isOpen ? 'connected' : 'disconnected'
        }
    });
});
// Get all order books
app.get("/api/orderbooks", async (_req, res) => {
    try {
        const keys = await redisClient.keys('orderbook:*');
        const orderBooks = [];
        for (const key of keys) {
            const data = await redisClient.get(key);
            if (data) {
                orderBooks.push(JSON.parse(data));
            }
        }
        res.json({
            success: true,
            count: orderBooks.length,
            data: orderBooks
        });
    }
    catch (error) {
        console.error('Error fetching order books:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch order books'
        });
    }
});
// Get order book for specific exchange and symbol
app.get("/api/orderbooks/:exchange/:symbol", async (req, res) => {
    try {
        const { exchange, symbol } = req.params;
        const key = `orderbook:${exchange}:${symbol}`;
        const data = await redisClient.get(key);
        if (!data) {
            res.status(404).json({
                success: false,
                error: 'Order book not found'
            });
            return;
        }
        const orderBook = JSON.parse(data);
        res.json({
            success: true,
            data: orderBook
        });
    }
    catch (error) {
        console.error('Error fetching order book:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch order book'
        });
    }
});
// Get comparative order book data for terminal UI
app.get("/api/orderbooks/compare/:symbol", async (req, res) => {
    try {
        const { symbol } = req.params;
        const keys = await redisClient.keys(`orderbook:*:${symbol}`);
        const orderBooks = {};
        for (const key of keys) {
            const data = await redisClient.get(key);
            if (data) {
                const orderBook = JSON.parse(data);
                const exchange = key.split(':')[1];
                if (!exchange)
                    continue;
                orderBooks[exchange] = {
                    exchange,
                    symbol: orderBook.symbol,
                    timestamp: orderBook.timestamp,
                    bestBid: orderBook.bids[0],
                    bestAsk: orderBook.asks[0],
                    bids: orderBook.bids.slice(0, 10), // Top 10 for UI
                    asks: orderBook.asks.slice(0, 10), // Top 10 for UI
                    totalBids: orderBook.bids.length,
                    totalAsks: orderBook.asks.length
                };
            }
        }
        res.json({
            success: true,
            data: orderBooks,
            timestamp: Date.now()
        });
    }
    catch (error) {
        console.error('Error fetching comparative order books:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch order books'
        });
    }
});
// Bot Configuration Endpoints
app.get("/api/bot/config", async (_req, res) => {
    try {
        const config = await redisClient.get('bot:config');
        const defaultConfig = {
            exchanges: ['binance', 'coinbase', 'kraken'],
            symbols: ['BTCUSD', 'ETHUSD'],
            minProfitPercent: 0.1,
            tradeAmount: 0.01,
            isActive: true
        };
        res.json({
            success: true,
            data: config ? JSON.parse(config) : defaultConfig
        });
    }
    catch (error) {
        console.error('Error fetching bot config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch bot configuration'
        });
    }
});
app.post("/api/bot/config", async (req, res) => {
    try {
        const { exchanges, symbols, minProfitPercent, tradeAmount, isActive } = req.body;
        const config = {
            exchanges: exchanges || ['binance', 'coinbase', 'kraken'],
            symbols: symbols || ['BTCUSD', 'ETHUSD'],
            minProfitPercent: minProfitPercent || 0.1,
            tradeAmount: tradeAmount || 0.01,
            isActive: isActive !== undefined ? isActive : true,
            updatedAt: Date.now()
        };
        await redisClient.set('bot:config', JSON.stringify(config));
        await redisClient.publish('bot:config:update', JSON.stringify(config));
        res.json({
            success: true,
            data: config,
            message: 'Bot configuration updated successfully'
        });
    }
    catch (error) {
        console.error('Error updating bot config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update bot configuration'
        });
    }
});
app.get("/api/bot/status", async (_req, res) => {
    try {
        const status = await redisClient.get('bot:status');
        const defaultStatus = {
            isRunning: false,
            connectedExchanges: [],
            lastOpportunity: null,
            uptime: 0
        };
        res.json({
            success: true,
            data: status ? JSON.parse(status) : defaultStatus
        });
    }
    catch (error) {
        console.error('Error fetching bot status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch bot status'
        });
    }
});
app.get("/api/exchanges", (_req, res) => {
    const exchanges = [
        { id: 'binance', name: 'Binance', fees: { taker: 0.075, maker: 0.075 } },
        { id: 'coinbase', name: 'Coinbase Pro', fees: { taker: 0.75, maker: 0.35 } },
        { id: 'kraken', name: 'Kraken', fees: { taker: 0.16, maker: 0.26 } },
        { id: 'bybit', name: 'Bybit', fees: { taker: 0.10, maker: 0.10 } },
        { id: 'kucoin', name: 'KuCoin', fees: { taker: 0.10, maker: 0.10 } },
        { id: 'gemini', name: 'Gemini', fees: { taker: 0.35, maker: 0.25 } }
    ];
    res.json({
        success: true,
        data: exchanges
    });
});
app.get("/api/currencies", (_req, res) => {
    const currencies = [
        { id: 'BTCUSD', name: 'Bitcoin', symbol: 'BTC', pair: 'BTC/USD' },
        { id: 'ETHUSD', name: 'Ethereum', symbol: 'ETH', pair: 'ETH/USD' },
        { id: 'SOLUSD', name: 'Solana', symbol: 'SOL', pair: 'SOL/USD' },
        { id: 'ADAUSD', name: 'Cardano', symbol: 'ADA', pair: 'ADA/USD' },
        { id: 'MATICUSD', name: 'Polygon', symbol: 'MATIC', pair: 'MATIC/USD' },
        { id: 'AVAXUSD', name: 'Avalanche', symbol: 'AVAX', pair: 'AVAX/USD' }
    ];
    res.json({
        success: true,
        data: currencies
    });
});
// Get best prices across exchanges
app.get("/api/prices/:symbol", async (req, res) => {
    try {
        const { symbol } = req.params;
        const keys = await redisClient.keys(`orderbook:*:${symbol}`);
        const prices = [];
        for (const key of keys) {
            const data = await redisClient.get(key);
            if (data) {
                const orderBook = JSON.parse(data);
                const bestBid = orderBook.bids[0];
                const bestAsk = orderBook.asks[0];
                if (bestBid && bestAsk) {
                    prices.push({
                        exchange: orderBook.exchange,
                        symbol: orderBook.symbol,
                        bestBid: parseFloat(bestBid.price),
                        bestAsk: parseFloat(bestAsk.price),
                        spread: parseFloat(bestAsk.price) - parseFloat(bestBid.price),
                        timestamp: orderBook.timestamp
                    });
                }
            }
        }
        res.json({
            success: true,
            symbol,
            count: prices.length,
            data: prices
        });
    }
    catch (error) {
        console.error('Error fetching prices:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch prices'
        });
    }
});
// Health check
app.get("/health", (_req, res) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
            redis: redisClient.isOpen ? 'connected' : 'disconnected'
        }
    });
});
// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await redisClient.disconnect();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    await redisClient.disconnect();
    process.exit(0);
});
app.listen(port, () => {
    console.log(`🌐 Arbot API running on port ${port}`);
    console.log(`📊 Endpoints available:`);
    console.log(`   GET  /                              - API status`);
    console.log(`   GET  /api/orderbooks                - All order books`);
    console.log(`   GET  /api/orderbooks/:exchange/:symbol - Specific order book`);
    console.log(`   GET  /api/prices/:symbol            - Best prices across exchanges`);
    console.log(`   GET  /health                        - Health check`);
});
//# sourceMappingURL=index.js.map