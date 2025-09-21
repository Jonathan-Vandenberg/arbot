'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";

interface OrderBookEntry {
  price: string;
  quantity: string;
}

interface OrderBook {
  exchange: string;
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

interface OrderBookComparison {
  symbol: string;
  exchanges: {
    [exchangeName: string]: OrderBook;
  };
}

interface OrderBookViewerProps {
  selectedSymbols: string[];
}

export function OrderBookViewer({ selectedSymbols }: OrderBookViewerProps) {
  const [orderBooks, setOrderBooks] = useState<OrderBookComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchOrderBooks = async () => {
    try {
      const comparisons: OrderBookComparison[] = [];
      
      for (const symbol of selectedSymbols) {
        const response = await fetch(`http://localhost:4000/api/orderbooks/compare/${symbol}`);
        const data = await response.json();
        
        if (data.success) {
          comparisons.push({
            symbol,
            exchanges: data.data
          });
        }
      }
      
      setOrderBooks(comparisons);
      setLastUpdate(new Date());
      setLoading(false);
    } catch (error) {
      console.error('❌ Error fetching order books:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSymbols.length === 0) {
      setLoading(false);
      return;
    }

    fetchOrderBooks();
    
    // Update every 2 seconds
    const interval = setInterval(fetchOrderBooks, 2000);
    
    return () => clearInterval(interval);
  }, [selectedSymbols]);

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    });
  };

  const formatQuantity = (quantity: string) => {
    const num = parseFloat(quantity);
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6
    });
  };

  const getBestPrices = (comparison: OrderBookComparison) => {
    const bestBids: { exchange: string; price: number }[] = [];
    const bestAsks: { exchange: string; price: number }[] = [];

    Object.entries(comparison.exchanges).forEach(([exchange, orderBook]) => {
      if (orderBook.bids.length > 0) {
        bestBids.push({
          exchange,
          price: parseFloat(orderBook.bids[0].price)
        });
      }
      if (orderBook.asks.length > 0) {
        bestAsks.push({
          exchange,
          price: parseFloat(orderBook.asks[0].price)
        });
      }
    });

    const highestBid = bestBids.reduce((max, bid) => bid.price > max.price ? bid : max, bestBids[0]);
    const lowestAsk = bestAsks.reduce((min, ask) => ask.price < min.price ? ask : min, bestAsks[0]);

    return { highestBid, lowestAsk, bestBids, bestAsks };
  };

  if (selectedSymbols.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📊 Order Book Monitor
          </CardTitle>
          <CardDescription>
            Select currency pairs in the Control Panel to view real-time order book data
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-12 text-muted-foreground">
          No currency pairs selected for monitoring
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📊 Order Book Monitor
            <Badge variant="outline">Loading...</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-12">
          <div className="text-muted-foreground">Fetching order book data...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          📊 Order Book Monitor
          <Badge variant="outline">
            {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : 'No data'}
          </Badge>
        </CardTitle>
        <CardDescription>
          Real-time order book comparison across exchanges
        </CardDescription>
      </CardHeader>
      <CardContent>
        {orderBooks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No order book data available
          </div>
        ) : (
          <Tabs defaultValue={orderBooks[0]?.symbol} className="w-full">
            <TabsList className="grid w-full grid-cols-auto">
              {orderBooks.map((comparison) => (
                <TabsTrigger key={comparison.symbol} value={comparison.symbol}>
                  {comparison.symbol}
                </TabsTrigger>
              ))}
            </TabsList>

            {orderBooks.map((comparison) => {
              const { highestBid, lowestAsk } = getBestPrices(comparison);
              const spread = highestBid && lowestAsk ? lowestAsk.price - highestBid.price : 0;
              const spreadPercent = spread > 0 ? (spread / highestBid.price) * 100 : 0;

              return (
                <TabsContent key={comparison.symbol} value={comparison.symbol} className="space-y-4">
                  {/* Spread Analysis */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground">Best Bid</div>
                        <div className="text-lg font-mono">
                          ${formatPrice(highestBid?.price.toString() || '0')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {highestBid?.exchange.toUpperCase()}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground">Best Ask</div>
                        <div className="text-lg font-mono">
                          ${formatPrice(lowestAsk?.price.toString() || '0')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {lowestAsk?.exchange.toUpperCase()}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground">Spread</div>
                        <div className="text-lg font-mono">
                          ${formatPrice(spread.toString())}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {spreadPercent.toFixed(4)}%
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Order Books by Exchange */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {Object.entries(comparison.exchanges).map(([exchange, orderBook]) => (
                      <Card key={exchange}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium">
                            {exchange.toUpperCase()} - {orderBook.symbol}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="grid grid-cols-2 text-xs">
                            {/* Asks (Sell Orders) */}
                            <div className="border-r">
                              <div className="bg-red-500/10 text-red-400 p-2 text-center font-medium">
                                ASKS (Sell)
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {orderBook.asks.slice(0, 10).reverse().map((ask, idx) => (
                                  <div key={idx} className="flex justify-between p-1 text-xs font-mono border-b border-red-500/20">
                                    <span className="text-red-400">${formatPrice(ask.price)}</span>
                                    <span className="text-muted-foreground">{formatQuantity(ask.quantity)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Bids (Buy Orders) */}
                            <div>
                              <div className="bg-green-500/10 text-green-400 p-2 text-center font-medium">
                                BIDS (Buy)
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {orderBook.bids.slice(0, 10).map((bid, idx) => (
                                  <div key={idx} className="flex justify-between p-1 text-xs font-mono border-b border-green-500/20">
                                    <span className="text-green-400">${formatPrice(bid.price)}</span>
                                    <span className="text-muted-foreground">{formatQuantity(bid.quantity)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
