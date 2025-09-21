import { EventEmitter } from 'events';
import { OrderBook } from '@arbot/shared';
export declare class GeminiWebSocketClient extends EventEmitter {
    private symbols;
    private ws;
    private readonly wsUrl;
    private readonly restUrl;
    private orderBooks;
    private reconnectAttempts;
    private readonly maxReconnectAttempts;
    private reconnectTimeout;
    constructor(symbols?: string[]);
    connect(): Promise<void>;
    private connectToSymbols;
    private initializeOrderBooks;
    private handleMessage;
    private handleOrderBookUpdate;
    private updateOrderBookSide;
    private handleReconnect;
    getOrderBook(symbol: string): OrderBook | undefined;
    getAllOrderBooks(): Map<string, OrderBook>;
    disconnect(): void;
}
//# sourceMappingURL=gemini.d.ts.map