export interface OrderBookEntry {
    price: string;
    quantity: string;
}
export interface OrderBook {
    symbol: string;
    exchange: string;
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
    timestamp: number;
    lastUpdateId?: number;
}
export interface Ticker {
    symbol: string;
    exchange: string;
    price: string;
    timestamp: number;
}
export interface ExchangeConfig {
    name: string;
    wsUrl: string;
    restUrl: string;
    apiKey?: string;
    apiSecret?: string;
    testnet?: boolean;
}
export declare enum ExchangeName {
    BINANCE = "binance",
    COINBASE = "coinbase",
    KRAKEN = "kraken",
    BYBIT = "bybit",
    KUCOIN = "kucoin",
    GEMINI = "gemini"
}
export interface WebSocketMessage {
    type: 'orderbook' | 'ticker' | 'error' | 'connection';
    exchange: string;
    data: any;
    timestamp: number;
}
export interface ArbitrageOpportunity {
    id: string;
    symbol: string;
    buyExchange: string;
    sellExchange: string;
    buyPrice: string;
    sellPrice: string;
    spread: string;
    spreadPercent: number;
    estimatedProfit: string;
    timestamp: number;
    fees: {
        buyFee: string;
        sellFee: string;
        totalFee: string;
    };
}
//# sourceMappingURL=exchange.d.ts.map