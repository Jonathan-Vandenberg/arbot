import { EventEmitter } from 'events';
import { OrderBook } from '@arbot/shared';
export declare class KuCoinWebSocketClient extends EventEmitter {
    private symbols;
    private ws;
    private wsUrl;
    private readonly restUrl;
    private orderBooks;
    private reconnectAttempts;
    private readonly maxReconnectAttempts;
    private reconnectTimeout;
    private token;
    private pingInterval;
    constructor(symbols?: string[]);
    connect(): Promise<void>;
    private getWebSocketInfo;
    private subscribeToOrderBooks;
    private startPing;
    private stopPing;
    private initializeOrderBooks;
    private handleMessage;
    private handleOrderBookUpdate;
    private updateOrderBookSide;
    private handleReconnect;
    getOrderBook(symbol: string): OrderBook | undefined;
    getAllOrderBooks(): Map<string, OrderBook>;
    disconnect(): void;
}
//# sourceMappingURL=kucoin.d.ts.map