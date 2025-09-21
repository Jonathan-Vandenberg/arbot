import { EventEmitter } from 'events';
import { OrderBook } from '@arbot/shared';
export interface TradingPair {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    normalizedSymbol: string;
    active: boolean;
    minOrderSize?: number;
    tickSize?: number;
}
export interface ExchangeInfo {
    name: string;
    id: string;
    tradingPairs: TradingPair[];
    fees: {
        taker: number;
        maker: number;
    };
    rateLimit: number;
}
export declare abstract class BaseExchange extends EventEmitter {
    protected exchangeId: string;
    protected symbols: string[];
    protected orderBooks: Map<string, OrderBook>;
    protected tradingPairs: TradingPair[];
    protected reconnectAttempts: number;
    protected readonly maxReconnectAttempts = 5;
    protected reconnectTimeout: NodeJS.Timeout | null;
    constructor(exchangeId: string, symbols?: string[]);
    abstract connect(): Promise<void>;
    abstract disconnect(): void;
    abstract getExchangeInfo(): Promise<ExchangeInfo>;
    abstract subscribeToOrderBooks(symbols: string[]): void;
    discoverTradingPairs(): Promise<TradingPair[]>;
    getTradingPairs(): TradingPair[];
    getOrderBook(symbol: string): OrderBook | undefined;
    getAllOrderBooks(): Map<string, OrderBook>;
    protected normalizeSymbol(baseAsset: string, quoteAsset: string): string;
    protected parseSymbol(symbol: string): {
        baseAsset: string;
        quoteAsset: string;
    } | null;
    protected handleReconnect(): void;
    protected cleanupReconnect(): void;
}
//# sourceMappingURL=base-exchange.d.ts.map