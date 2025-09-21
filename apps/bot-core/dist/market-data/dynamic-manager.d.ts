import { EventEmitter } from 'events';
import { OrderBook } from '@arbot/shared';
interface BotConfig {
    exchanges: string[];
    symbols: string[];
    minProfitPercent: number;
    tradeAmount: number;
    isActive: boolean;
}
export declare class DynamicMarketDataManager extends EventEmitter {
    private redisClient;
    private subscriberClient;
    private opportunityDetector;
    private exchangeClients;
    private isRunning;
    private currentConfig;
    constructor();
    private setupEventHandlers;
    start(): Promise<void>;
    private loadConfiguration;
    private updateConfiguration;
    private startExchangeConnections;
    private restartExchangeConnections;
    private createExchangeClient;
    private getSymbolsForExchange;
    private setupExchangeEventHandlers;
    private handleOrderBookUpdate;
    private updateBotStatus;
    getOrderBook(exchange: string, symbol: string): Promise<OrderBook | null>;
    getAllOrderBooks(): Promise<OrderBook[]>;
    stop(): Promise<void>;
    isManagerRunning(): boolean;
    getCurrentConfig(): BotConfig;
}
export {};
//# sourceMappingURL=dynamic-manager.d.ts.map