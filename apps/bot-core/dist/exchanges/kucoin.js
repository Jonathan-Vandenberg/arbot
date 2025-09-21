"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KuCoinWebSocketClient = void 0;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const shared_1 = require("@arbot/shared");
class KuCoinWebSocketClient extends events_1.EventEmitter {
    symbols;
    ws = null;
    wsUrl = '';
    restUrl = 'https://api.kucoin.com';
    orderBooks = new Map();
    reconnectAttempts = 0;
    maxReconnectAttempts = 5;
    reconnectTimeout = null;
    token = '';
    pingInterval = null;
    constructor(symbols = ['BTC-USDT', 'ETH-USDT']) {
        super();
        this.symbols = symbols;
    }
    async connect() {
        try {
            // Get WebSocket connection details from KuCoin
            await this.getWebSocketInfo();
            // Get initial snapshots for all symbols
            await this.initializeOrderBooks();
            // Create WebSocket connection
            this.ws = new ws_1.default(this.wsUrl);
            this.ws.on('open', () => {
                this.subscribeToOrderBooks();
                this.startPing();
                this.reconnectAttempts = 0;
                this.emit('connected', { exchange: shared_1.ExchangeName.KUCOIN });
            });
            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                }
                catch (error) {
                    console.error('[KuCoin] Error parsing message:', error);
                }
            });
            this.ws.on('close', () => {
                this.stopPing();
                this.handleReconnect();
            });
            this.ws.on('error', (error) => {
                console.error('[KuCoin] WebSocket error:', error);
                this.emit('error', { exchange: shared_1.ExchangeName.KUCOIN, error });
            });
        }
        catch (error) {
            console.error('[KuCoin] Connection failed:', error);
            this.handleReconnect();
        }
    }
    async getWebSocketInfo() {
        try {
            const response = await fetch(`${this.restUrl}/api/v1/bullet-public`);
            const data = await response.json();
            if (data.code !== '200000') {
                throw new Error(`KuCoin API error: ${data.msg}`);
            }
            const instanceServer = data.data.instanceServers[0];
            this.token = data.data.token;
            this.wsUrl = `${instanceServer.endpoint}?token=${this.token}&[connectId=${Date.now()}]`;
        }
        catch (error) {
            console.error('[KuCoin] Failed to get WebSocket info:', error);
            throw error;
        }
    }
    subscribeToOrderBooks() {
        if (!this.ws)
            return;
        const topics = this.symbols.map(symbol => `/market/level2:${symbol}`);
        topics.forEach((topic, index) => {
            const subscribeMessage = {
                id: `${Date.now()}_${index}`,
                type: 'subscribe',
                topic,
                privateChannel: false,
                response: true
            };
            this.ws.send(JSON.stringify(subscribeMessage));
        });
    }
    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === ws_1.default.OPEN) {
                this.ws.send(JSON.stringify({
                    id: Date.now().toString(),
                    type: 'ping'
                }));
            }
        }, 20000); // Ping every 20 seconds
    }
    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    async initializeOrderBooks() {
        for (const symbol of this.symbols) {
            try {
                const response = await fetch(`${this.restUrl}/api/v1/market/orderbook/level2_100?symbol=${symbol}`);
                const data = await response.json();
                if (data.code !== '200000') {
                    console.error(`[KuCoin] API Error for ${symbol}:`, data.msg);
                    continue;
                }
                const result = data.data;
                const orderBook = {
                    symbol,
                    exchange: shared_1.ExchangeName.KUCOIN,
                    bids: result.bids.slice(0, 100).map(([price, quantity]) => ({ price, quantity })),
                    asks: result.asks.slice(0, 100).map(([price, quantity]) => ({ price, quantity })),
                    timestamp: Date.now()
                };
                this.orderBooks.set(symbol, orderBook);
            }
            catch (error) {
                console.error(`[KuCoin] Failed to initialize ${symbol} order book:`, error);
            }
        }
    }
    handleMessage(message) {
        if (message.type === 'message' && message.topic && message.topic.startsWith('/market/level2:')) {
            this.handleOrderBookUpdate(message);
        }
        else if (message.type === 'pong') {
            // Pong response - connection is alive
        }
    }
    handleOrderBookUpdate(update) {
        const symbol = update.data.symbol;
        const existingOrderBook = this.orderBooks.get(symbol);
        if (!existingOrderBook) {
            return;
        }
        let updatedBids = [...existingOrderBook.bids];
        let updatedAsks = [...existingOrderBook.asks];
        // Apply bid updates
        update.data.bids.forEach(([price, quantity]) => {
            updatedBids = this.updateOrderBookSide(updatedBids, price, quantity);
        });
        // Apply ask updates
        update.data.asks.forEach(([price, quantity]) => {
            updatedAsks = this.updateOrderBookSide(updatedAsks, price, quantity);
        });
        const updatedOrderBook = {
            ...existingOrderBook,
            bids: updatedBids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)), // Descending
            asks: updatedAsks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)), // Ascending
            timestamp: Date.now()
        };
        this.orderBooks.set(symbol, updatedOrderBook);
        this.emit('orderbook', updatedOrderBook);
    }
    updateOrderBookSide(existing, price, quantity) {
        const result = existing.filter(entry => entry.price !== price);
        if (parseFloat(quantity) > 0) {
            result.push({ price, quantity });
        }
        return result;
    }
    handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[KuCoin] Max reconnection attempts reached');
            this.emit('error', {
                exchange: shared_1.ExchangeName.KUCOIN,
                error: new Error('Max reconnection attempts reached')
            });
            return;
        }
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, delay);
    }
    getOrderBook(symbol) {
        return this.orderBooks.get(symbol);
    }
    getAllOrderBooks() {
        return new Map(this.orderBooks);
    }
    disconnect() {
        this.stopPing();
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
exports.KuCoinWebSocketClient = KuCoinWebSocketClient;
//# sourceMappingURL=kucoin.js.map