"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SymbolNormalizer = void 0;
class SymbolNormalizer {
    normalizedPairs = new Map();
    // Common asset mappings across exchanges
    assetMappings = new Map([
        ['XBT', 'BTC'], // Kraken uses XBT for Bitcoin
        ['USDT', 'USD'], // Normalize Tether to USD for comparison
        ['USDC', 'USD'], // Normalize USD Coin to USD for comparison
    ]);
    // Quote asset priority (higher priority = preferred for arbitrage)
    quoteAssetPriority = new Map([
        ['USD', 10],
        ['USDT', 9],
        ['USDC', 8],
        ['EUR', 7],
        ['BTC', 6],
        ['ETH', 5],
    ]);
    addTradingPairs(exchangeId, tradingPairs) {
        for (const pair of tradingPairs) {
            if (!pair.active)
                continue;
            const normalizedBase = this.normalizeAsset(pair.baseAsset);
            const normalizedQuote = this.normalizeAsset(pair.quoteAsset);
            const normalizedSymbol = `${normalizedBase}${normalizedQuote}`;
            let normalizedPair = this.normalizedPairs.get(normalizedSymbol);
            if (!normalizedPair) {
                normalizedPair = {
                    baseAsset: normalizedBase,
                    quoteAsset: normalizedQuote,
                    normalizedSymbol,
                    exchangeSymbols: new Map()
                };
                this.normalizedPairs.set(normalizedSymbol, normalizedPair);
            }
            normalizedPair.exchangeSymbols.set(exchangeId, pair.symbol);
        }
    }
    normalizeAsset(asset) {
        return this.assetMappings.get(asset.toUpperCase()) || asset.toUpperCase();
    }
    // Get all normalized symbols that are available on at least minExchanges
    getAvailableSymbols(minExchanges = 2) {
        return Array.from(this.normalizedPairs.values())
            .filter(pair => pair.exchangeSymbols.size >= minExchanges)
            .map(pair => pair.normalizedSymbol)
            .sort((a, b) => {
            // Sort by quote asset priority, then alphabetically
            const aQuote = this.extractQuoteAsset(a);
            const bQuote = this.extractQuoteAsset(b);
            const aPriority = this.quoteAssetPriority.get(aQuote) || 0;
            const bPriority = this.quoteAssetPriority.get(bQuote) || 0;
            if (aPriority !== bPriority) {
                return bPriority - aPriority; // Higher priority first
            }
            return a.localeCompare(b);
        });
    }
    // Get exchange-specific symbol for a normalized symbol
    getExchangeSymbol(normalizedSymbol, exchangeId) {
        const pair = this.normalizedPairs.get(normalizedSymbol);
        return pair?.exchangeSymbols.get(exchangeId) || null;
    }
    // Get all exchanges that support a normalized symbol
    getExchangesForSymbol(normalizedSymbol) {
        const pair = this.normalizedPairs.get(normalizedSymbol);
        return pair ? Array.from(pair.exchangeSymbols.keys()) : [];
    }
    // Get normalized symbol from exchange-specific symbol
    getNormalizedSymbol(exchangeId, exchangeSymbol) {
        for (const [normalizedSymbol, pair] of this.normalizedPairs) {
            if (pair.exchangeSymbols.get(exchangeId) === exchangeSymbol) {
                return normalizedSymbol;
            }
        }
        return null;
    }
    extractQuoteAsset(normalizedSymbol) {
        // Extract quote asset from normalized symbol (e.g., 'BTCUSD' -> 'USD')
        const commonQuotes = ['USD', 'USDT', 'USDC', 'EUR', 'BTC', 'ETH'];
        for (const quote of commonQuotes) {
            if (normalizedSymbol.endsWith(quote)) {
                return quote;
            }
        }
        return 'UNKNOWN';
    }
    // Get trading pairs grouped by base asset
    getAssetGroups() {
        const groups = new Map();
        for (const pair of this.normalizedPairs.values()) {
            if (pair.exchangeSymbols.size >= 2) { // Only include pairs available on multiple exchanges
                const existing = groups.get(pair.baseAsset) || [];
                existing.push(pair.normalizedSymbol);
                groups.set(pair.baseAsset, existing);
            }
        }
        return groups;
    }
    // Get statistics about symbol coverage
    getStats() {
        const exchangeCoverage = new Map();
        let multiExchangePairs = 0;
        for (const pair of this.normalizedPairs.values()) {
            if (pair.exchangeSymbols.size >= 2) {
                multiExchangePairs++;
            }
            for (const exchangeId of pair.exchangeSymbols.keys()) {
                exchangeCoverage.set(exchangeId, (exchangeCoverage.get(exchangeId) || 0) + 1);
            }
        }
        return {
            totalNormalizedPairs: this.normalizedPairs.size,
            multiExchangePairs,
            exchangeCoverage
        };
    }
    clear() {
        this.normalizedPairs.clear();
    }
}
exports.SymbolNormalizer = SymbolNormalizer;
//# sourceMappingURL=symbol-normalizer.js.map