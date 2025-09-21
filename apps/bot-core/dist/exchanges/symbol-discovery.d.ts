export interface DiscoveryConfig {
    enabledExchanges: string[];
    minExchangesPerSymbol: number;
    maxSymbolsPerExchange: number;
    preferredQuoteAssets: string[];
    preferredBaseAssets: string[];
}
export declare class SymbolDiscoveryService {
    private config;
    private normalizer;
    private exchanges;
    constructor(config: DiscoveryConfig);
    discoverSymbols(): Promise<{
        availableSymbols: string[];
        exchangeStats: Map<string, number>;
        recommendations: string[];
    }>;
    private initializeExchanges;
    private fetchTradingPairs;
    private filterTradingPairs;
    private generateRecommendations;
    getExchangeSymbol(normalizedSymbol: string, exchangeId: string): string | null;
    getExchangesForSymbol(normalizedSymbol: string): string[];
    getNormalizedSymbol(exchangeId: string, exchangeSymbol: string): string | null;
    getAssetGroups(): Map<string, string[]>;
    getStats(): {
        totalNormalizedPairs: number;
        multiExchangePairs: number;
        exchangeCoverage: Map<string, number>;
    };
    getArbitrageSymbols(maxSymbols?: number): string[];
}
//# sourceMappingURL=symbol-discovery.d.ts.map