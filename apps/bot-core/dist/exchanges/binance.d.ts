import { BaseExchange, ExchangeInfo } from './base-exchange';
export declare class BinanceWebSocketClient extends BaseExchange {
    private ws;
    private readonly baseUrl;
    private readonly restUrl;
    constructor(symbols?: string[]);
    getExchangeInfo(): Promise<ExchangeInfo>;
    subscribeToOrderBooks(symbols: string[]): void;
    connect(): Promise<void>;
    private setupWebSocketHandlers;
    private initializeOrderBooks;
    private handleDepthUpdate;
    private updateOrderBookSide;
    disconnect(): void;
}
//# sourceMappingURL=binance.d.ts.map