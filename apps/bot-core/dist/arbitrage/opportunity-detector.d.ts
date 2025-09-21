import { EventEmitter } from 'events';
import { OrderBook } from '@arbot/shared';
interface OpportunityConfig {
    minProfitPercent: number;
    slippageBuffer: number;
    maxSpreadAge: number;
}
export declare class OpportunityDetector extends EventEmitter {
    private readonly fees;
    private readonly config;
    private readonly tradeAmount;
    private orderBooks;
    private lastOpportunityCheck;
    private readonly checkInterval;
    constructor();
    updateOrderBook(orderBook: OrderBook): void;
    private detectOpportunities;
    private getAvailableSymbols;
    private normalizeSymbol;
    private findArbitrageOpportunities;
    private getExchangeSymbol;
    private isOrderBookFresh;
    private calculateOpportunity;
    private isProfitableOpportunity;
    private handleOpportunity;
    private saveOpportunityToDatabase;
    private cleanupOldOpportunities;
    private ensureExchangesExist;
    private generateOpportunityId;
    getConfig(): OpportunityConfig;
    updateConfig(newConfig: Partial<OpportunityConfig>): void;
}
export {};
//# sourceMappingURL=opportunity-detector.d.ts.map