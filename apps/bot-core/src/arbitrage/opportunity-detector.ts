import { EventEmitter } from 'events';
import { OrderBook, ArbitrageOpportunity } from '@arbot/shared';
import dotenv from 'dotenv';

// Ensure environment variables are loaded before importing Prisma
dotenv.config();
import { prisma } from '@arbot/db';

interface ExchangeFees {
  [exchange: string]: {
    taker: number; // Taker fee percentage (e.g., 0.001 = 0.1%)
    maker: number; // Maker fee percentage
  };
}

interface OpportunityConfig {
  minProfitPercent: number; // Minimum profit percentage required
  slippageBuffer: number;   // Additional buffer for slippage
  maxSpreadAge: number;     // Maximum age of price data in milliseconds
}

export class OpportunityDetector extends EventEmitter {
  private readonly fees: ExchangeFees = {
    binance: { taker: 0.001, maker: 0.0 }, // 0.1% taker / 0% maker (with BNB discount)
    coinbase: { taker: 0.006, maker: 0.004 }, // 0.6% taker / 0.4% maker (Advanced Trade <$1K volume)
    kraken: { taker: 0.01, maker: 0.01 }, // 1% fixed trading fee (standard account)
    kucoin: { taker: 0.0008, maker: 0.0008 }, // 0.08% when paid with KCS token
    bybit: { taker: 0.001, maker: 0.001 }, // 0.1% taker/maker (standard rate)
    gemini: { taker: 0.004, maker: 0.002 } // 0.4% taker / 0.2% maker (ActiveTrader $0-$10K volume)
  };

  private readonly config: OpportunityConfig = {
    minProfitPercent: -0.5, // Set to -0.5% to see near-break-even opportunities
    slippageBuffer: 0.0,      // No slippage buffer for testing
    maxSpreadAge: 5000        // Max 5 seconds old
  };

  private tradeAmount = 1000; // Default trade amount, will be updated from config

  private orderBooks = new Map<string, OrderBook>();
  private lastOpportunityCheck = 0;

  constructor() {
    super();
  }

  updateOrderBook(orderBook: OrderBook): void {
    const key = `${orderBook.exchange}:${orderBook.symbol}`;
    this.orderBooks.set(key, orderBook);
    
    // Throttle opportunity detection to avoid spam (reduced to 1 second)
    const now = Date.now();
    if (now - this.lastOpportunityCheck > 1000) {
      this.detectOpportunities();
      this.lastOpportunityCheck = now;
    }
  }

  private detectOpportunities(): void {
    const symbols = this.getAvailableSymbols();
    
    for (const symbol of symbols) {
      const opportunities = this.findArbitrageOpportunities(symbol);
      
      for (const opportunity of opportunities) {
        const isProfitable = this.isProfitableOpportunity(opportunity);
        
        if (isProfitable) {
          this.handleOpportunity(opportunity);
        }
      }
    }
  }

  private getAvailableSymbols(): string[] {
    const symbols = new Set<string>();
    
    for (const [, orderBook] of this.orderBooks) {
      // Convert symbols to common format (e.g., BTC-USD -> BTCUSD)
      const normalizedSymbol = this.normalizeSymbol(orderBook.symbol);
      symbols.add(normalizedSymbol);
    }
    
    return Array.from(symbols);
  }

  private normalizeSymbol(symbol: string): string {
    // Convert different exchange formats to common format
    return symbol.replace(/-/g, '').replace(/USDT/g, 'USD');
  }

  private findArbitrageOpportunities(symbol: string): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Get order books for this symbol from all available exchanges
    const orderBooksByExchange = new Map<string, OrderBook>();
    
    // Look through all stored order books to find ones matching this symbol
    for (const [_key, orderBook] of this.orderBooks) {
      const normalizedSymbol = this.normalizeSymbol(orderBook.symbol);
      if (normalizedSymbol === symbol && this.isOrderBookFresh(orderBook)) {
        orderBooksByExchange.set(orderBook.exchange, orderBook);
      }
    }
    
    if (orderBooksByExchange.size < 2) {
      return opportunities;
    }

    // Compare prices between all exchange pairs
    const exchangeList = Array.from(orderBooksByExchange.keys());
    
    for (let i = 0; i < exchangeList.length; i++) {
      for (let j = i + 1; j < exchangeList.length; j++) {
        const exchange1 = exchangeList[i];
        const exchange2 = exchangeList[j];
        
        if (!exchange1 || !exchange2) continue;
        
        const orderBook1 = orderBooksByExchange.get(exchange1);
        const orderBook2 = orderBooksByExchange.get(exchange2);
        
        if (!orderBook1 || !orderBook2) continue;
        
        // Check both directions: buy on exchange1, sell on exchange2
        const opp1 = this.calculateOpportunity(orderBook1, orderBook2, symbol);
        const opp2 = this.calculateOpportunity(orderBook2, orderBook1, symbol);
        
        if (opp1) opportunities.push(opp1);
        if (opp2) opportunities.push(opp2);
      }
    }
    
    return opportunities;
  }


  private isOrderBookFresh(orderBook: OrderBook): boolean {
    const age = Date.now() - orderBook.timestamp;
    return age <= this.config.maxSpreadAge;
  }

  private calculateOpportunity(
    buyOrderBook: OrderBook,
    sellOrderBook: OrderBook,
    symbol: string
  ): ArbitrageOpportunity | null {
    const bestBid = sellOrderBook.bids[0]; // Price we can sell at
    const bestAsk = buyOrderBook.asks[0];  // Price we need to buy at
    
    if (!bestBid || !bestAsk) {
      return null;
    }
    
    const buyPrice = parseFloat(bestAsk.price);
    const sellPrice = parseFloat(bestBid.price);
    
    // Calculate asset quantity based on USD trade amount
    const assetQuantity = this.tradeAmount / buyPrice; // How much of the asset we can buy with $1,000
    
    // Calculate fees based on USD trade amount
    const buyValue = this.tradeAmount; // We're spending $1,000 USD to buy
    const sellValue = sellPrice * assetQuantity; // USD we get from selling the asset
    const buyFee = buyValue * (this.fees[buyOrderBook.exchange]?.taker || 0.001);
    const sellFee = sellValue * (this.fees[sellOrderBook.exchange]?.taker || 0.001);
    const totalFees = buyFee + sellFee;
    
    // Calculate profit for the trade amount
    const grossProfit = sellValue - buyValue; // Difference in USD
    const netProfit = grossProfit - totalFees;
    const profitPercent = (netProfit / buyValue) * 100;
    
    console.log(`💰 ${symbol} ${buyOrderBook.exchange} → ${sellOrderBook.exchange}:`);
    console.log(`   Buy: $${buyPrice.toFixed(2)} | Sell: $${sellPrice.toFixed(2)} | Quantity: ${assetQuantity.toFixed(4)}`);
    console.log(`   Gross: $${grossProfit.toFixed(2)} | Net: $${netProfit.toFixed(2)} | Profit: ${profitPercent.toFixed(3)}%`);
    console.log(`   Fees: $${totalFees.toFixed(2)} (Buy: $${buyFee.toFixed(2)}, Sell: $${sellFee.toFixed(2)})`);
    
    // Only return if there's a profitable opportunity that meets our minimum threshold
    if (profitPercent < this.config.minProfitPercent) {
      console.log(`   ❌ Below threshold (${profitPercent.toFixed(3)}% < ${this.config.minProfitPercent}%)`);
      return null;
    }
    
    console.log(`   ✅ OPPORTUNITY DETECTED! Profit: ${profitPercent.toFixed(3)}%`);
    
    const opportunity: ArbitrageOpportunity = {
      id: this.generateOpportunityId(),
      symbol,
      buyExchange: buyOrderBook.exchange,
      sellExchange: sellOrderBook.exchange,
      buyPrice: buyPrice.toString(),
      sellPrice: sellPrice.toString(),
      spread: grossProfit.toString(),
      spreadPercent: profitPercent,
      estimatedProfit: netProfit.toString(),
      timestamp: Date.now(),
      fees: {
        buyFee: buyFee.toString(),
        sellFee: sellFee.toString(),
        totalFee: totalFees.toString()
      }
    };
    
    return opportunity;
  }

  private isProfitableOpportunity(opportunity: ArbitrageOpportunity): boolean {
    const requiredProfit = this.config.minProfitPercent + this.config.slippageBuffer;
    return opportunity.spreadPercent >= requiredProfit;
  }

  private async handleOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    try {
      // Log the opportunity
      console.log('💰 ARBITRAGE OPPORTUNITY DETECTED!');
      console.log(`   Symbol: ${opportunity.symbol}`);
      console.log(`   Buy:  ${opportunity.buyPrice} on ${opportunity.buyExchange}`);
      console.log(`   Sell: ${opportunity.sellPrice} on ${opportunity.sellExchange}`);
      console.log(`   Gross Spread: $${parseFloat(opportunity.spread).toFixed(2)} (${opportunity.spreadPercent.toFixed(3)}%)`);
      console.log(`   Net Profit: $${parseFloat(opportunity.estimatedProfit).toFixed(2)} (after fees)`);
      console.log(`   Fees: $${parseFloat(opportunity.fees.totalFee).toFixed(2)}`);
      console.log('   ----------------------------------------');
      
      // Save to database
      await this.saveOpportunityToDatabase(opportunity);
      
      // Emit event for real-time notifications
      this.emit('opportunity_detected', opportunity);
      
    } catch (error) {
      console.error('❌ Error handling opportunity:', error);
    }
  }

  private async saveOpportunityToDatabase(opportunity: ArbitrageOpportunity): Promise<void> {
    try {
      // Save the new opportunity
      await prisma.arbitrageOpportunity.create({
        data: {
          symbol: opportunity.symbol,
          buyExchange: { connect: { id: opportunity.buyExchange } },
          sellExchange: { connect: { id: opportunity.sellExchange } },
          buyPrice: parseFloat(opportunity.buyPrice),
          sellPrice: parseFloat(opportunity.sellPrice),
          spread: parseFloat(opportunity.spread),
          spreadPercent: opportunity.spreadPercent,
          estimatedProfit: parseFloat(opportunity.estimatedProfit),
          buyFee: parseFloat(opportunity.fees.buyFee),
          sellFee: parseFloat(opportunity.fees.sellFee),
          totalFee: parseFloat(opportunity.fees.totalFee),
          timestamp: new Date(opportunity.timestamp)
        }
      });

      // Keep only the latest 1000 records
      await this.cleanupOldOpportunities();
    } catch (error) {
      // If exchanges don't exist in DB, create them first
      if (error instanceof Error && error.message.includes('Foreign key constraint')) {
        await this.ensureExchangesExist();
        // Retry saving the opportunity
        await this.saveOpportunityToDatabase(opportunity);
      } else {
        console.error('❌ Database error:', error);
      }
    }
  }

  private async cleanupOldOpportunities(): Promise<void> {
    try {
      // Count total opportunities
      const totalCount = await prisma.arbitrageOpportunity.count();
      
      if (totalCount > 1000) {
        // Get the ID of the 1000th most recent record
        const keepFromRecord = await prisma.arbitrageOpportunity.findMany({
          select: { id: true },
          orderBy: { timestamp: 'desc' },
          take: 1,
          skip: 999 // Skip the first 999 to get the 1000th
        });
        
        if (keepFromRecord.length > 0 && keepFromRecord[0]) {
          const cutoffId = keepFromRecord[0].id;
          
          // Delete all records older than the cutoff
          const deletedCount = await prisma.arbitrageOpportunity.deleteMany({
            where: {
              id: { lt: cutoffId }
            }
          });
          
          if (deletedCount.count > 0) {
            console.log(`🧹 Cleaned up ${deletedCount.count} old opportunities (keeping latest 1000)`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }

  private async ensureExchangesExist(): Promise<void> {
    const exchanges = ['binance', 'coinbase'];
    
    for (const exchangeName of exchanges) {
      await prisma.exchange.upsert({
        where: { name: exchangeName },
        update: {},
        create: {
          name: exchangeName,
          wsUrl: exchangeName === 'binance' 
            ? 'wss://stream.binance.com:9443/ws' 
            : 'wss://ws-feed.exchange.coinbase.com',
          restUrl: exchangeName === 'binance'
            ? 'https://api.binance.com/api/v3'
            : 'https://api.exchange.coinbase.com'
        }
      });
    }
  }

  private generateOpportunityId(): string {
    return `opp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getConfig(): OpportunityConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<OpportunityConfig>): void {
    Object.assign(this.config, newConfig);
    console.log('⚙️ Opportunity detection config updated:', this.config);
  }

  updateTradeAmount(amount: number): void {
    this.tradeAmount = amount;
    console.log(`💰 Trade amount updated to: $${amount}`);
  }
}
