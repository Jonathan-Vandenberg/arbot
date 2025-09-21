"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SymbolDiscoveryService = void 0;
const symbol_normalizer_1 = require("./symbol-normalizer");
const binance_1 = require("./binance");
const coinbase_1 = require("./coinbase");
const kraken_1 = require("./kraken");
const bybit_1 = require("./bybit");
const kucoin_1 = require("./kucoin");
const gemini_1 = require("./gemini");
class SymbolDiscoveryService {
    config;
    normalizer = new symbol_normalizer_1.SymbolNormalizer();
    exchanges = new Map();
    constructor(config) {
        this.config = config;
    }
    async discoverSymbols() {
        console.log('🔍 Discovering trading pairs across exchanges...');
        // Initialize exchanges
        await this.initializeExchanges();
        // Discover trading pairs from each exchange
        await this.fetchTradingPairs();
        // Get available symbols
        const availableSymbols = this.normalizer.getAvailableSymbols(this.config.minExchangesPerSymbol);
        const stats = this.normalizer.getStats();
        // Generate recommendations based on preferences
        const recommendations = this.generateRecommendations(availableSymbols);
        console.log(`✅ Discovery complete: ${availableSymbols.length} symbols available across ${this.config.enabledExchanges.length} exchanges`);
        return {
            availableSymbols,
            exchangeStats: stats.exchangeCoverage,
            recommendations
        };
    }
    async initializeExchanges() {
        for (const exchangeId of this.config.enabledExchanges) {
            let exchange;
            switch (exchangeId) {
                case 'binance':
                    exchange = new binance_1.BinanceWebSocketClient([]);
                    break;
                case 'coinbase':
                    exchange = new coinbase_1.CoinbaseWebSocketClient([]);
                    break;
                case 'kraken':
                    exchange = new kraken_1.KrakenWebSocketClient([]);
                    break;
                case 'bybit':
                    exchange = new bybit_1.BybitWebSocketClient([]);
                    break;
                case 'kucoin':
                    exchange = new kucoin_1.KuCoinWebSocketClient([]);
                    break;
                case 'gemini':
                    exchange = new gemini_1.GeminiWebSocketClient([]);
                    break;
                default:
                    console.warn(`Unknown exchange: ${exchangeId}`);
                    continue;
            }
            this.exchanges.set(exchangeId, exchange);
        }
    }
    async fetchTradingPairs() {
        const promises = Array.from(this.exchanges.entries()).map(async ([exchangeId, exchange]) => {
            try {
                console.log(`📡 Fetching trading pairs from ${exchangeId}...`);
                const tradingPairs = await exchange.discoverTradingPairs();
                // Filter by preferences if specified
                const filteredPairs = this.filterTradingPairs(tradingPairs, exchangeId);
                this.normalizer.addTradingPairs(exchangeId, filteredPairs);
                console.log(`✅ ${exchangeId}: ${filteredPairs.length} trading pairs discovered`);
            }
            catch (error) {
                console.error(`❌ Failed to fetch trading pairs from ${exchangeId}:`, error);
            }
        });
        await Promise.all(promises);
    }
    filterTradingPairs(pairs, exchangeId) {
        let filtered = pairs.filter(pair => pair.active);
        // Filter by preferred quote assets
        if (this.config.preferredQuoteAssets.length > 0) {
            filtered = filtered.filter(pair => this.config.preferredQuoteAssets.some(quote => pair.quoteAsset === quote ||
                (quote === 'USD' && ['USDT', 'USDC'].includes(pair.quoteAsset))));
        }
        // Filter by preferred base assets
        if (this.config.preferredBaseAssets.length > 0) {
            filtered = filtered.filter(pair => this.config.preferredBaseAssets.includes(pair.baseAsset));
        }
        // Limit number of symbols per exchange
        if (this.config.maxSymbolsPerExchange > 0) {
            // Sort by volume or other criteria if available, for now just take first N
            filtered = filtered.slice(0, this.config.maxSymbolsPerExchange);
        }
        return filtered;
    }
    generateRecommendations(availableSymbols) {
        // Prioritize symbols based on:
        // 1. Number of exchanges supporting them
        // 2. Preferred quote assets
        // 3. Preferred base assets
        const scored = availableSymbols.map(symbol => {
            const exchanges = this.normalizer.getExchangesForSymbol(symbol);
            let score = exchanges.length * 10; // Base score from exchange count
            // Bonus for preferred quote assets
            if (symbol.endsWith('USD') || symbol.endsWith('USDT')) {
                score += 20;
            }
            // Bonus for major cryptocurrencies
            if (symbol.startsWith('BTC') || symbol.startsWith('ETH')) {
                score += 15;
            }
            else if (['SOL', 'ADA', 'MATIC', 'AVAX'].some(base => symbol.startsWith(base))) {
                score += 10;
            }
            return { symbol, score, exchangeCount: exchanges.length };
        });
        // Sort by score and return top recommendations
        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, 20) // Top 20 recommendations
            .map(item => item.symbol);
    }
    getExchangeSymbol(normalizedSymbol, exchangeId) {
        return this.normalizer.getExchangeSymbol(normalizedSymbol, exchangeId);
    }
    getExchangesForSymbol(normalizedSymbol) {
        return this.normalizer.getExchangesForSymbol(normalizedSymbol);
    }
    getNormalizedSymbol(exchangeId, exchangeSymbol) {
        return this.normalizer.getNormalizedSymbol(exchangeId, exchangeSymbol);
    }
    getAssetGroups() {
        return this.normalizer.getAssetGroups();
    }
    getStats() {
        return this.normalizer.getStats();
    }
    // Get optimal symbol selection for arbitrage
    getArbitrageSymbols(maxSymbols = 10) {
        const availableSymbols = this.normalizer.getAvailableSymbols(2);
        const recommendations = this.generateRecommendations(availableSymbols);
        // Filter to ensure good exchange coverage
        const filtered = recommendations.filter(symbol => {
            const exchanges = this.normalizer.getExchangesForSymbol(symbol);
            return exchanges.length >= 2; // At least 2 exchanges for arbitrage
        });
        return filtered.slice(0, maxSymbols);
    }
}
exports.SymbolDiscoveryService = SymbolDiscoveryService;
//# sourceMappingURL=symbol-discovery.js.map