"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const dynamic_manager_1 = require("./market-data/dynamic-manager");
// Load environment variables from the root directory
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env') });
async function main() {
    // Initialize dynamic market data manager
    const marketDataManager = new dynamic_manager_1.DynamicMarketDataManager();
    // Set up event listeners
    marketDataManager.on('started', () => {
        console.log('🎯 Arbitrage bot active - monitoring opportunities');
    });
    marketDataManager.on('orderbook_update', (_orderBook) => {
        // Order book updates are now processed by the opportunity detector
    });
    marketDataManager.on('arbitrage_opportunity', (_opportunity) => {
        // Arbitrage opportunities are already logged by the detector
        // This event can be used for notifications, alerts, etc.
    });
    marketDataManager.on('error', (error) => {
        console.error('💥 Market data manager error:', error);
    });
    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n🛑 Received SIGINT, shutting down gracefully...');
        await marketDataManager.stop();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
        await marketDataManager.stop();
        process.exit(0);
    });
    try {
        // Start the market data manager
        await marketDataManager.start();
    }
    catch (error) {
        console.error('💥 Failed to start Bot-Core:', error);
        process.exit(1);
    }
}
// Start the application
main().catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map