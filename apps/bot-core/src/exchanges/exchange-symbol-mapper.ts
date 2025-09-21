export interface ExchangeSymbolFormat {
  exchangeId: string;
  nativeFormat: string;
  separator: string;
  baseFirst: boolean;
  examples: string[];
  specialMappings?: Map<string, string>; // For special cases like XBT -> BTC
}

export class ExchangeSymbolMapper {
  private exchangeFormats: Map<string, ExchangeSymbolFormat> = new Map();
  
  constructor() {
    this.initializeExchangeFormats();
  }

  private initializeExchangeFormats(): void {
    // Binance format: BASEUSDT (REAL API DATA - ALL COMMON CURRENCIES)
    this.exchangeFormats.set('binance', {
      exchangeId: 'binance',
      nativeFormat: 'BASEQOUTE',
      separator: '',
      baseFirst: true,
      examples: [
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'NEOUSDT', 'LTCUSDT', 
        'QTUMUSDT', 'ADAUSDT', 'XRPUSDT', 'EOSUSDT', 'IOTAUSDT',
        'XLMUSDT', 'ONTUSDT', 'TRXUSDT', 'ETCUSDT', 'ICXUSDT',
        'LINKUSDT', 'UNIUSDT', 'AAVEUSDT', 'DOTUSDT', 'MATICUSDT',
        'AVAXUSDT', 'SOLUSDT', 'ATOMUSDT', 'ALGOUSDT', 'XTZUSDT',
        'COMPUSDT', 'MKRUSDT', 'YFIUSDT', 'SUSHIUSDT', 'CRVUSDT'
      ]
    });

    // Coinbase format: BASE-USD (dash separator)
    this.exchangeFormats.set('coinbase', {
      exchangeId: 'coinbase',
      nativeFormat: 'BASE-QUOTE',
      separator: '-',
      baseFirst: true,
      examples: [
        'BTC-USD', 'ETH-USD', 'LTC-USD', 'ADA-USD', 'XRP-USD',
        'AAVE-USD', 'LINK-USD', 'UNI-USD', 'DOT-USD', 'MATIC-USD',
        'AVAX-USD', 'SOL-USD', 'ATOM-USD', 'ALGO-USD', 'XTZ-USD',
        'COMP-USD', 'MKR-USD', 'YFI-USD', 'SUSHI-USD', 'CRV-USD'
      ]
    });

    // Kraken format: BASE/USD (slash separator, XBT for Bitcoin)
    const krakenSpecialMappings = new Map([
      ['BTC', 'XBT'], // Kraken uses XBT for Bitcoin
      ['XBT', 'BTC']  // Reverse mapping
    ]);
    this.exchangeFormats.set('kraken', {
      exchangeId: 'kraken',
      nativeFormat: 'BASE/QUOTE',
      separator: '/',
      baseFirst: true,
      examples: [
        'XBT/USD', 'ETH/USD', 'LTC/USD', 'XRP/USD', 'ADA/USD',
        'DOT/USD', 'LINK/USD', 'UNI/USD', 'AAVE/USD', 'MATIC/USD',
        'AVAX/USD', 'SOL/USD', 'ATOM/USD', 'ALGO/USD', 'XTZ/USD',
        'COMP/USD', 'MKR/USD', 'YFI/USD', 'SUSHI/USD', 'CRV/USD'
      ],
      specialMappings: krakenSpecialMappings
    });

    // Bybit format: BASEUSDT (REAL API DATA - ALL COMMON CURRENCIES)
    this.exchangeFormats.set('bybit', {
      exchangeId: 'bybit',
      nativeFormat: 'BASEQOUTE',
      separator: '',
      baseFirst: true,
      examples: [
        'BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'DOTUSDT', 'XLMUSDT',
        'LTCUSDT', 'ADAUSDT', 'LINKUSDT', 'UNIUSDT', 'AAVEUSDT',
        'AVAXUSDT', 'SOLUSDT', 'ATOMUSDT', 'ALGOUSDT', 'XTZUSDT',
        'COMPUSDT', 'MKRUSDT', 'YFIUSDT', 'SUSHIUSDT', 'CRVUSDT'
      ]
    });

    // KuCoin format: BASE-USDT (REAL API DATA - ALL COMMON CURRENCIES)
    this.exchangeFormats.set('kucoin', {
      exchangeId: 'kucoin',
      nativeFormat: 'BASE-QUOTE',
      separator: '-',
      baseFirst: true,
      examples: [
        'BTC-USDT', 'ETH-USDT', 'BNB-USDT', 'NEO-USDT', 'LTC-USDT',
        'QTUM-USDT', 'ADA-USDT', 'XRP-USDT', 'EOS-USDT', 'IOTA-USDT',
        'XLM-USDT', 'ONT-USDT', 'TRX-USDT', 'XTZ-USDT', 'ALGO-USDT',
        'LINK-USDT', 'UNI-USDT', 'AAVE-USDT', 'DOT-USDT', 'MATIC-USDT',
        'AVAX-USDT', 'SOL-USDT', 'ATOM-USDT', 'COMP-USDT', 'MKR-USDT'
      ]
    });

    // Gemini format: baseusdt (lowercase, no separator)
    this.exchangeFormats.set('gemini', {
      exchangeId: 'gemini',
      nativeFormat: 'baseqoute',
      separator: '',
      baseFirst: true,
      examples: [
        'btcusd', 'ethusd', 'ltcusd', 'linkusd',
        'uniusd', 'aaveusd', 'maticusd', 'dotusd',
        'avaxusd', 'solusd', 'atomusd', 'algousd',
        'xtzusd', 'compusd', 'mkrusd', 'yfiusd'
      ]
    });
  }

  // Convert from normalized symbol (BTCUSD) to exchange-specific format
  toExchangeSymbol(normalizedSymbol: string, exchangeId: string): string | null {
    const format = this.exchangeFormats.get(exchangeId);
    if (!format) return null;

    const parsed = this.parseNormalizedSymbol(normalizedSymbol);
    if (!parsed) return null;

    let { base, quote } = parsed;

    // Apply special mappings (e.g., BTC -> XBT for Kraken)
    if (format.specialMappings) {
      base = format.specialMappings.get(base) || base;
    }

    // Convert USD to USDT for exchanges that use USDT
    if (quote === 'USD' && (exchangeId === 'binance' || exchangeId === 'kucoin' || exchangeId === 'bybit')) {
      quote = 'USDT';
    }

    // Apply case formatting
    if (format.nativeFormat.toLowerCase() === format.nativeFormat) {
      base = base.toLowerCase();
      quote = quote.toLowerCase();
    } else {
      base = base.toUpperCase();
      quote = quote.toUpperCase();
    }

    // Combine with separator
    return format.baseFirst ? `${base}${format.separator}${quote}` : `${quote}${format.separator}${base}`;
  }

  // Convert from exchange-specific format to normalized symbol (BTCUSD)
  fromExchangeSymbol(exchangeSymbol: string, exchangeId: string): string | null {
    const format = this.exchangeFormats.get(exchangeId);
    if (!format) return null;

    const parsed = this.parseExchangeSymbol(exchangeSymbol, format);
    if (!parsed) return null;

    let { base, quote } = parsed;

    // Apply reverse special mappings (e.g., XBT -> BTC for Kraken)
    if (format.specialMappings) {
      base = format.specialMappings.get(base) || base;
    }

    // Normalize quote asset (USDT -> USD for consistency)
    quote = this.normalizeQuoteAsset(quote);

    return `${base.toUpperCase()}${quote.toUpperCase()}`;
  }

  private parseNormalizedSymbol(symbol: string): { base: string; quote: string } | null {
    // Common quote assets in order of preference (longest first to avoid conflicts)
    const quoteAssets = ['USDT', 'USDC', 'USD', 'EUR', 'BTC', 'ETH', 'BNB'];
    
    for (const quote of quoteAssets) {
      if (symbol.endsWith(quote)) {
        const base = symbol.slice(0, -quote.length);
        if (base.length > 0) {
          return { base, quote };
        }
      }
    }
    
    return null;
  }

  private parseExchangeSymbol(symbol: string, format: ExchangeSymbolFormat): { base: string; quote: string } | null {
    if (format.separator) {
      const parts = symbol.split(format.separator);
      if (parts.length === 2 && parts[0] && parts[1]) {
        return format.baseFirst 
          ? { base: parts[0], quote: parts[1] }
          : { base: parts[1], quote: parts[0] };
      }
    } else {
      // No separator - need to guess where base ends and quote begins
      // Try common quote assets
      const quoteAssets = ['USDT', 'USDC', 'USD', 'EUR', 'BTC', 'ETH'];
      const upperSymbol = symbol.toUpperCase();
      
      for (const quote of quoteAssets) {
        if (upperSymbol.endsWith(quote)) {
          const base = upperSymbol.slice(0, -quote.length);
          if (base.length > 0) {
            return { base, quote };
          }
        }
      }
    }
    
    return null;
  }

  private normalizeQuoteAsset(quote: string): string {
    const normalized = quote.toUpperCase();
    // Normalize stablecoins to USD for comparison
    if (['USDT', 'USDC', 'BUSD', 'DAI'].includes(normalized)) {
      return 'USD';
    }
    return normalized;
  }

  // Get all supported symbols for an exchange
  getSupportedSymbols(exchangeId: string): string[] {
    const format = this.exchangeFormats.get(exchangeId);
    return format ? format.examples : [];
  }

  // Get exchange format info
  getExchangeFormat(exchangeId: string): ExchangeSymbolFormat | null {
    return this.exchangeFormats.get(exchangeId) || null;
  }

  // Find common symbols across multiple exchanges
  findCommonSymbols(exchangeIds: string[], baseAssets: string[] = ['BTC', 'ETH']): Map<string, Map<string, string>> {
    const commonSymbols = new Map<string, Map<string, string>>();
    
    for (const base of baseAssets) {
      // For each base asset, try to find compatible quote assets
      const normalizedSymbol = `${base}USD`; // Always normalize to USD
      const exchangeSymbols = new Map<string, string>();
      
      for (const exchangeId of exchangeIds) {
        const format = this.exchangeFormats.get(exchangeId);
        if (!format) continue;
        
        // Find a supported symbol for this exchange
        let foundSymbol: string | null = null;
        
        // Check each example to see if it matches our base asset
        for (const example of format.examples) {
          const parsed = this.parseExchangeSymbol(example, format);
          if (parsed) {
            let { base: exampleBase } = parsed;
            
            // Apply reverse special mappings (e.g., XBT -> BTC for Kraken)
            if (format.specialMappings) {
              exampleBase = format.specialMappings.get(exampleBase) || exampleBase;
            }
            
            if (exampleBase.toUpperCase() === base.toUpperCase()) {
              foundSymbol = example;
              break;
            }
          }
        }
        
        if (foundSymbol) {
          exchangeSymbols.set(exchangeId, foundSymbol);
        }
      }
      
      // Only include if supported by ALL requested exchanges
      if (exchangeSymbols.size === exchangeIds.length) {
        commonSymbols.set(normalizedSymbol, exchangeSymbols);
      }
    }
    
    return commonSymbols;
  }


  // Debug method to show all mappings
  debugMappings(): void {
    console.log('🔍 Exchange Symbol Mappings:');
    
    const testSymbols = ['BTCUSD', 'ETHUSD', 'SOLUSD'];
    const exchanges = Array.from(this.exchangeFormats.keys());
    
    for (const normalizedSymbol of testSymbols) {
      console.log(`\n📊 ${normalizedSymbol}:`);
      
      for (const exchangeId of exchanges) {
        const exchangeSymbol = this.toExchangeSymbol(normalizedSymbol, exchangeId);
        const backConverted = exchangeSymbol ? this.fromExchangeSymbol(exchangeSymbol, exchangeId) : null;
        
        console.log(`  ${exchangeId.padEnd(8)}: ${exchangeSymbol || 'N/A'} ${backConverted === normalizedSymbol ? '✅' : '❌'}`);
      }
    }
  }
}
