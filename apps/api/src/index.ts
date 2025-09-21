import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "redis";
import { OrderBook } from "@arbot/shared";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env['PORT'] || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Redis client
const redisClient = createClient({
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
    const orderBooks: OrderBook[] = [];
    
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
  } catch (error) {
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
    
    const orderBook: OrderBook = JSON.parse(data);
    res.json({
      success: true,
      data: orderBook
    });
  } catch (error) {
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
    const orderBooks: any = {};
    
    for (const key of keys) {
      const data = await redisClient.get(key);
      if (data) {
        const orderBook = JSON.parse(data);
        const exchange = key.split(':')[1];
        if (!exchange) continue;
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
  } catch (error) {
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
  } catch (error) {
    console.error('Error fetching bot config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bot configuration'
    });
  }
});

app.post("/api/bot/config", async (req, res) => {
  try {
    const { exchanges, symbols, minProfitPercent, tradeAmount, orderBookDepth, isActive } = req.body;
    
    const config = {
      exchanges: exchanges || ['binance', 'coinbase', 'kraken'],
      symbols: symbols || ['BTCUSD', 'ETHUSD'],
      minProfitPercent: minProfitPercent || 0.1,
      tradeAmount: tradeAmount || 0.01,
      orderBookDepth: orderBookDepth || 50,
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
  } catch (error) {
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
  } catch (error) {
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

app.get("/api/currencies", async (_req, res) => {
  // Import ExchangeSymbolMapper to get all supported currencies
  const { ExchangeSymbolMapper } = require('../../bot-core/src/exchanges/exchange-symbol-mapper');
  const symbolMapper = new ExchangeSymbolMapper();
  
  // Get current bot configuration to see which exchanges are selected
  let selectedExchanges = ['binance', 'coinbase', 'kraken']; // Default
  try {
    const config = await redisClient.get('bot:config');
    if (config) {
      const parsedConfig = JSON.parse(config);
      selectedExchanges = parsedConfig.exchanges || selectedExchanges;
    }
  } catch (error) {
    console.log('Using default exchanges for currency list:', error);
  }
  
  console.log('🔍 Selected exchanges for currencies:', selectedExchanges);
  
  // Get all possible base assets (comprehensive list)
  const allBaseAssets = [
    'BTC', 'ETH', 'LTC', 'ADA', 'XRP', 'LINK', 'UNI', 'AAVE', 
    'DOT', 'MATIC', 'BNB', 'NEO', 'QTUM', 'EOS', 'IOTA', 
    'XLM', 'ONT', 'TRX', 'ETC', 'ICX', 'SOL', 'AVAX'
  ];
  
  // Find common symbols across SELECTED exchanges only
  const commonSymbols = symbolMapper.findCommonSymbols(selectedExchanges, allBaseAssets);
  console.log('💰 Found common symbols:', commonSymbols.size, 'symbols');
  
  // Convert to currency format for frontend
  const currencies = (Array.from(commonSymbols.keys()) as string[]).map(normalizedSymbol => {
    // Extract base currency from normalized symbol (e.g., BTCUSD -> BTC)
    const base = normalizedSymbol.replace(/USD[T]?$/, '');
    
    // Create human-readable names
    const nameMap: Record<string, string> = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum', 
      'LTC': 'Litecoin',
      'ADA': 'Cardano',
      'XRP': 'Ripple',
      'LINK': 'Chainlink',
      'UNI': 'Uniswap',
      'AAVE': 'Aave',
      'DOT': 'Polkadot',
      'MATIC': 'Polygon',
      'BNB': 'Binance Coin',
      'NEO': 'Neo',
      'QTUM': 'Qtum',
      'EOS': 'EOS',
      'IOTA': 'IOTA',
      'XLM': 'Stellar',
      'ONT': 'Ontology',
      'TRX': 'Tron',
      'ETC': 'Ethereum Classic',
      'ICX': 'ICON',
      'SOL': 'Solana',
      'AVAX': 'Avalanche'
    };
    
    return {
      id: normalizedSymbol,
      name: nameMap[base] || base,
      symbol: base,
      pair: `${base}/USD`
    };
  });
  
  // Sort by popularity (BTC, ETH first, then alphabetically)
  currencies.sort((a, b) => {
    const priority = ['BTCUSD', 'ETHUSD'];
    const aIndex = priority.indexOf(a.id);
    const bIndex = priority.indexOf(b.id);
    
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    
    return a.name.localeCompare(b.name);
  });
  
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
    const prices: any[] = [];
    
    for (const key of keys) {
      const data = await redisClient.get(key);
      if (data) {
        const orderBook: OrderBook = JSON.parse(data);
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
  } catch (error) {
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
