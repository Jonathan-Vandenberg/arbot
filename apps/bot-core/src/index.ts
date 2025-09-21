import * as dotenv from 'dotenv';
import * as path from 'path';
import { DynamicMarketDataManager } from './market-data/dynamic-manager';

// Load environment variables from the root directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  // Initialize dynamic market data manager
  const marketDataManager = new DynamicMarketDataManager();
  
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
    
  } catch (error) {
    console.error('💥 Failed to start Bot-Core:', error);
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
