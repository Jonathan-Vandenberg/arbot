import { EventEmitter } from 'events';
import { OrderBook } from '@arbot/shared';
export declare class MarketDataManager extends EventEmitter {
    private binanceClient;
    private coinbaseClient;
    private krakenClient;
    private redisClient;
    private opportunityDetector;
    private isRunning;
    constructor(_symbols?: string[]);
    private setupEventHandlers;
    start(): Promise<void>;
    private handleOrderBookUpdate;
    getOrderBook(exchange: string, symbol: string): Promise<OrderBook | null>;
    getAllOrderBooks(): Promise<OrderBook[]>;
    getExchangeOrderBooks(): {
        binance: Map<string, OrderBook>;
        coinbase: Map<string, OrderBook>;
    };
    stop(): Promise<void>;
    isManagerRunning(): boolean;
}
//# sourceMappingURL=manager.d.ts.map