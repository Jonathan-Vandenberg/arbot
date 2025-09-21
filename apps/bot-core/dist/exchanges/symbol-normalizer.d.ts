import { TradingPair } from './base-exchange';
export interface NormalizedPair {
    baseAsset: string;
    quoteAsset: string;
    normalizedSymbol: string;
    exchangeSymbols: Map<string, string>;
}
export declare class SymbolNormalizer {
    private normalizedPairs;
    private assetMappings;
    private quoteAssetPriority;
    addTradingPairs(exchangeId: string, tradingPairs: TradingPair[]): void;
    private normalizeAsset;
    getAvailableSymbols(minExchanges?: number): string[];
    getExchangeSymbol(normalizedSymbol: string, exchangeId: string): string | null;
    getExchangesForSymbol(normalizedSymbol: string): string[];
    getNormalizedSymbol(exchangeId: string, exchangeSymbol: string): string | null;
    private extractQuoteAsset;
    getAssetGroups(): Map<string, string[]>;
    getStats(): {
        totalNormalizedPairs: number;
        multiExchangePairs: number;
        exchangeCoverage: Map<string, number>;
    };
    clear(): void;
}
//# sourceMappingURL=symbol-normalizer.d.ts.map