"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpportunityDetector = void 0;
const events_1 = require("events");
const dotenv_1 = __importDefault(require("dotenv"));
// Ensure environment variables are loaded before importing Prisma
dotenv_1.default.config();
const db_1 = require("@arbot/db");
class OpportunityDetector extends events_1.EventEmitter {
    fees = {
        binance: { taker: 0.00075, maker: 0.00075 }, // 0.075% with BNB discount (25% off 0.1%)
        coinbase: { taker: 0.0075, maker: 0.0035 }, // 0.75% taker / 0.35% maker (with $1000+ volume)
        kraken: { taker: 0.0016, maker: 0.0026 } // 0.16% taker / 0.26% maker (much better than Coinbase!)
    };
    config = {
        minProfitPercent: 0.1, // Set to 0.1% for more opportunities
        slippageBuffer: 0.1, // 0.1% slippage buffer
        maxSpreadAge: 5000 // Max 5 seconds old
    };
    tradeAmount = 0.01; // Trade 0.01 BTC (~$1,158) instead of 1 BTC
    orderBooks = new Map();
    lastOpportunityCheck = 0;
    checkInterval = 1000; // Check every 1 second
    constructor() {
        super();
    }
    updateOrderBook(orderBook) {
        const key = `${orderBook.exchange}:${orderBook.symbol}`;
        this.orderBooks.set(key, orderBook);
        // Throttle opportunity detection to avoid spam
        const now = Date.now();
        if (now - this.lastOpportunityCheck > this.checkInterval) {
            this.detectOpportunities();
            this.lastOpportunityCheck = now;
        }
    }
    detectOpportunities() {
        const symbols = this.getAvailableSymbols();
        for (const symbol of symbols) {
            const opportunities = this.findArbitrageOpportunities(symbol);
            for (const opportunity of opportunities) {
                const isProfitable = this.isProfitableOpportunity(opportunity);
                if (isProfitable) {
                    this.handleOpportunity(opportunity);
                }
            }
        }
    }
    getAvailableSymbols() {
        const symbols = new Set();
        for (const [, orderBook] of this.orderBooks) {
            // Convert symbols to common format (e.g., BTC-USD -> BTCUSD)
            const normalizedSymbol = this.normalizeSymbol(orderBook.symbol);
            symbols.add(normalizedSymbol);
        }
        return Array.from(symbols);
    }
    normalizeSymbol(symbol) {
        // Convert different exchange formats to common format
        return symbol.replace(/-/g, '').replace(/USDT/g, 'USD');
    }
    findArbitrageOpportunities(symbol) {
        const opportunities = [];
        const exchanges = ['binance', 'coinbase', 'kraken'];
        // Get order books for this symbol from all exchanges
        const orderBooksByExchange = new Map();
        for (const exchange of exchanges) {
            const exchangeSymbol = this.getExchangeSymbol(symbol, exchange);
            const key = `${exchange}:${exchangeSymbol}`;
            const orderBook = this.orderBooks.get(key);
            if (orderBook && this.isOrderBookFresh(orderBook)) {
                orderBooksByExchange.set(exchange, orderBook);
            }
        }
        if (orderBooksByExchange.size < 2) {
            return opportunities;
        }
        // Compare prices between all exchange pairs
        const exchangeList = Array.from(orderBooksByExchange.keys());
        for (let i = 0; i < exchangeList.length; i++) {
            for (let j = i + 1; j < exchangeList.length; j++) {
                const exchange1 = exchangeList[i];
                const exchange2 = exchangeList[j];
                if (!exchange1 || !exchange2)
                    continue;
                const orderBook1 = orderBooksByExchange.get(exchange1);
                const orderBook2 = orderBooksByExchange.get(exchange2);
                if (!orderBook1 || !orderBook2)
                    continue;
                // Check both directions: buy on exchange1, sell on exchange2
                const opp1 = this.calculateOpportunity(orderBook1, orderBook2, symbol);
                const opp2 = this.calculateOpportunity(orderBook2, orderBook1, symbol);
                if (opp1)
                    opportunities.push(opp1);
                if (opp2)
                    opportunities.push(opp2);
            }
        }
        return opportunities;
    }
    getExchangeSymbol(normalizedSymbol, exchange) {
        // Convert normalized symbol back to exchange-specific format
        switch (exchange) {
            case 'binance':
                return normalizedSymbol.replace(/USD$/, 'USDT');
            case 'coinbase':
                // BTCUSD -> BTC-USD
                if (normalizedSymbol === 'BTCUSD')
                    return 'BTC-USD';
                if (normalizedSymbol === 'ETHUSD')
                    return 'ETH-USD';
                return normalizedSymbol;
            case 'kraken':
                // BTCUSD -> BTC/USD
                if (normalizedSymbol === 'BTCUSD')
                    return 'BTC/USD';
                if (normalizedSymbol === 'ETHUSD')
                    return 'ETH/USD';
                return normalizedSymbol;
            default:
                return normalizedSymbol;
        }
    }
    isOrderBookFresh(orderBook) {
        const age = Date.now() - orderBook.timestamp;
        return age <= this.config.maxSpreadAge;
    }
    calculateOpportunity(buyOrderBook, sellOrderBook, symbol) {
        const bestBid = sellOrderBook.bids[0]; // Price we can sell at
        const bestAsk = buyOrderBook.asks[0]; // Price we need to buy at
        if (!bestBid || !bestAsk) {
            return null;
        }
        const buyPrice = parseFloat(bestAsk.price);
        const sellPrice = parseFloat(bestBid.price);
        // Calculate fees based on actual trade amount (not 1 full BTC)
        const buyValue = buyPrice * this.tradeAmount;
        const sellValue = sellPrice * this.tradeAmount;
        const buyFee = buyValue * (this.fees[buyOrderBook.exchange]?.taker || 0.001);
        const sellFee = sellValue * (this.fees[sellOrderBook.exchange]?.taker || 0.001);
        const totalFees = buyFee + sellFee;
        // Calculate profit for the trade amount
        const grossProfit = (sellPrice - buyPrice) * this.tradeAmount;
        const netProfit = grossProfit - totalFees;
        const profitPercent = (netProfit / buyValue) * 100;
        // Only return if there's a profitable opportunity that meets our minimum threshold
        if (netProfit <= 0 || profitPercent < this.config.minProfitPercent) {
            return null;
        }
        const opportunity = {
            id: this.generateOpportunityId(),
            symbol,
            buyExchange: buyOrderBook.exchange,
            sellExchange: sellOrderBook.exchange,
            buyPrice: buyPrice.toString(),
            sellPrice: sellPrice.toString(),
            spread: grossProfit.toString(),
            spreadPercent: profitPercent,
            estimatedProfit: netProfit.toString(),
            timestamp: Date.now(),
            fees: {
                buyFee: buyFee.toString(),
                sellFee: sellFee.toString(),
                totalFee: totalFees.toString()
            }
        };
        return opportunity;
    }
    isProfitableOpportunity(opportunity) {
        const requiredProfit = this.config.minProfitPercent + this.config.slippageBuffer;
        return opportunity.spreadPercent >= requiredProfit;
    }
    async handleOpportunity(opportunity) {
        try {
            // Log the opportunity
            console.log('💰 ARBITRAGE OPPORTUNITY DETECTED!');
            console.log(`   Symbol: ${opportunity.symbol}`);
            console.log(`   Buy:  ${opportunity.buyPrice} on ${opportunity.buyExchange}`);
            console.log(`   Sell: ${opportunity.sellPrice} on ${opportunity.sellExchange}`);
            console.log(`   Gross Spread: $${parseFloat(opportunity.spread).toFixed(2)} (${opportunity.spreadPercent.toFixed(3)}%)`);
            console.log(`   Net Profit: $${parseFloat(opportunity.estimatedProfit).toFixed(2)} (after fees)`);
            console.log(`   Fees: $${parseFloat(opportunity.fees.totalFee).toFixed(2)}`);
            console.log('   ----------------------------------------');
            // Save to database
            await this.saveOpportunityToDatabase(opportunity);
            // Emit event for real-time notifications
            this.emit('opportunity_detected', opportunity);
        }
        catch (error) {
            console.error('❌ Error handling opportunity:', error);
        }
    }
    async saveOpportunityToDatabase(opportunity) {
        try {
            // Save the new opportunity
            await db_1.prisma.arbitrageOpportunity.create({
                data: {
                    symbol: opportunity.symbol,
                    buyExchange: { connect: { id: opportunity.buyExchange } },
                    sellExchange: { connect: { id: opportunity.sellExchange } },
                    buyPrice: parseFloat(opportunity.buyPrice),
                    sellPrice: parseFloat(opportunity.sellPrice),
                    spread: parseFloat(opportunity.spread),
                    spreadPercent: opportunity.spreadPercent,
                    estimatedProfit: parseFloat(opportunity.estimatedProfit),
                    buyFee: parseFloat(opportunity.fees.buyFee),
                    sellFee: parseFloat(opportunity.fees.sellFee),
                    totalFee: parseFloat(opportunity.fees.totalFee),
                    timestamp: new Date(opportunity.timestamp)
                }
            });
            // Keep only the latest 1000 records
            await this.cleanupOldOpportunities();
        }
        catch (error) {
            // If exchanges don't exist in DB, create them first
            if (error instanceof Error && error.message.includes('Foreign key constraint')) {
                await this.ensureExchangesExist();
                // Retry saving the opportunity
                await this.saveOpportunityToDatabase(opportunity);
            }
            else {
                console.error('❌ Database error:', error);
            }
        }
    }
    async cleanupOldOpportunities() {
        try {
            // Count total opportunities
            const totalCount = await db_1.prisma.arbitrageOpportunity.count();
            if (totalCount > 1000) {
                // Get the ID of the 1000th most recent record
                const keepFromRecord = await db_1.prisma.arbitrageOpportunity.findMany({
                    select: { id: true },
                    orderBy: { timestamp: 'desc' },
                    take: 1,
                    skip: 999 // Skip the first 999 to get the 1000th
                });
                if (keepFromRecord.length > 0 && keepFromRecord[0]) {
                    const cutoffId = keepFromRecord[0].id;
                    // Delete all records older than the cutoff
                    const deletedCount = await db_1.prisma.arbitrageOpportunity.deleteMany({
                        where: {
                            id: { lt: cutoffId }
                        }
                    });
                    if (deletedCount.count > 0) {
                        console.log(`🧹 Cleaned up ${deletedCount.count} old opportunities (keeping latest 1000)`);
                    }
                }
            }
        }
        catch (error) {
            console.error('❌ Error during cleanup:', error);
        }
    }
    async ensureExchangesExist() {
        const exchanges = ['binance', 'coinbase'];
        for (const exchangeName of exchanges) {
            await db_1.prisma.exchange.upsert({
                where: { name: exchangeName },
                update: {},
                create: {
                    name: exchangeName,
                    wsUrl: exchangeName === 'binance'
                        ? 'wss://stream.binance.com:9443/ws'
                        : 'wss://ws-feed.exchange.coinbase.com',
                    restUrl: exchangeName === 'binance'
                        ? 'https://api.binance.com/api/v3'
                        : 'https://api.exchange.coinbase.com'
                }
            });
        }
    }
    generateOpportunityId() {
        return `opp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        console.log('⚙️ Opportunity detection config updated:', this.config);
    }
}
exports.OpportunityDetector = OpportunityDetector;
//# sourceMappingURL=opportunity-detector.js.map