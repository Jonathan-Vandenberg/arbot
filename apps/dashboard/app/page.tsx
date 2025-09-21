'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Header } from "@/components/Header";
import { BotStatusCard } from "@/components/BotStatusCard";
import { ConfigPanel } from "@/components/ConfigPanel";
import { OpportunitiesList } from "@/components/OpportunitiesList";
import { OrderBookViewer } from "@/components/OrderBookViewer";

interface ArbitrageOpportunity {
  id: string;
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  profitPercent: number;
  netProfit: number;
  timestamp: string;
}

interface Exchange {
  id: string;
  name: string;
  fees: { taker: number; maker: number };
}

interface Currency {
  id: string;
  name: string;
  symbol: string;
  pair: string;
}

interface BotConfig {
  exchanges: string[];
  symbols: string[];
  minProfitPercent: number;
  tradeAmount: number;
  orderBookDepth: number;
  isActive: boolean;
}

interface BotStatus {
  isRunning: boolean;
  connectedExchanges: string[];
  lastOpportunity: ArbitrageOpportunity | null;
  uptime: number;
}

export default function Dashboard() {
  const [botConfig, setBotConfig] = useState<BotConfig>({
    exchanges: ['binance', 'coinbase', 'kraken'],
    symbols: ['BTCUSD', 'ETHUSD'],
    minProfitPercent: 0.1,
    tradeAmount: 0.01,
    orderBookDepth: 50,
    isActive: true
  });
  
  const [botStatus, setBotStatus] = useState<BotStatus>({
    isRunning: false,
    connectedExchanges: [],
    lastOpportunity: null,
    uptime: 0
  });
  
  const [availableExchanges, setAvailableExchanges] = useState<Exchange[]>([]);
  const [availableCurrencies, setAvailableCurrencies] = useState<Currency[]>([]);
  const [opportunities, _setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch initial data
  const fetchInitialData = async () => {
    try {
      const [configRes, statusRes, exchangesRes, currenciesRes] = await Promise.all([
        fetch('http://localhost:4000/api/bot/config'),
        fetch('http://localhost:4000/api/bot/status'),
        fetch('http://localhost:4000/api/exchanges'),
        fetch('http://localhost:4000/api/currencies')
      ]);

      const [configData, statusData, exchangesData, currenciesData] = await Promise.all([
        configRes.json(),
        statusRes.json(),
        exchangesRes.json(),
        currenciesRes.json()
      ]);

      if (configData.success) setBotConfig(configData.data);
      if (statusData.success) setBotStatus(statusData.data);
      if (exchangesData.success) setAvailableExchanges(exchangesData.data);
      if (currenciesData.success) {
        console.log('📊 Received currencies:', currenciesData.data);
        setAvailableCurrencies(currenciesData.data);
      } else {
        console.error('❌ Failed to fetch currencies:', currenciesData);
        // Fallback currencies
        setAvailableCurrencies([
          { id: 'BTCUSD', name: 'Bitcoin', symbol: 'BTC', pair: 'BTC/USD' },
          { id: 'ETHUSD', name: 'Ethereum', symbol: 'ETH', pair: 'ETH/USD' },
          { id: 'LTCUSD', name: 'Litecoin', symbol: 'LTC', pair: 'LTC/USD' },
          { id: 'ADAUSD', name: 'Cardano', symbol: 'ADA', pair: 'ADA/USD' }
        ]);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching initial data:', error);
      setLoading(false);
    }
  };

  // Fetch currencies based on selected exchanges
  const fetchCurrencies = async (selectedExchanges?: string[]) => {
    try {
      // If exchanges are provided, temporarily save them to get updated currency list
      if (selectedExchanges) {
        const tempConfig = { ...botConfig, exchanges: selectedExchanges };
        await fetch('http://localhost:4000/api/bot/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tempConfig)
        });
      }
      
      const response = await fetch('http://localhost:4000/api/currencies');
      const data = await response.json();
      
      if (data.success) {
        console.log('📊 Updated currencies for exchanges:', selectedExchanges || botConfig.exchanges);
        setAvailableCurrencies(data.data);
        return data.data;
      }
    } catch (error) {
      console.error('❌ Error fetching currencies:', error);
    }
    return [];
  };

  // Update bot configuration
  const updateBotConfig = async (newConfig: BotConfig) => {
    setSaving(true);
    try {
      const response = await fetch('http://localhost:4000/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });

      const data = await response.json();
      if (data.success) {
        setBotConfig(data.data);
        // Refetch currencies for the new exchange selection
        await fetchCurrencies(data.data.exchanges);
        console.log('✅ Configuration updated successfully');
      }
    } catch (error) {
      console.error('❌ Error updating configuration:', error);
    } finally {
      setSaving(false);
    }
  };

  // Fetch opportunities periodically
  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        // This would be your opportunities endpoint
        // const response = await fetch('http://localhost:4000/api/opportunities');
        // const data = await response.json();
        // if (data.success) setOpportunities(data.data);
      } catch (error) {
        console.error('Error fetching opportunities:', error);
      }
    };

    fetchInitialData();
    
    // Set up periodic updates
    const interval = setInterval(() => {
      fetchOpportunities();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-green-400 bg-clip-text text-transparent">
            🤖 Loading Arbot Dashboard...
          </div>
          <div className="text-muted-foreground">Connecting to trading systems...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header 
        isRunning={botStatus.isRunning} 
        connectedExchanges={botStatus.connectedExchanges} 
      />
      
      <div className="p-6">
        <Tabs defaultValue="control" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="control">🎛️ Control Panel</TabsTrigger>
            <TabsTrigger value="monitor">📊 Monitor</TabsTrigger>
            <TabsTrigger value="opportunities">💰 Opportunities</TabsTrigger>
          </TabsList>

          <TabsContent value="control" className="space-y-6">
            <BotStatusCard status={botStatus} />
            <ConfigPanel
              config={botConfig}
              exchanges={availableExchanges}
              currencies={availableCurrencies}
              onConfigUpdate={updateBotConfig}
              onExchangeChange={fetchCurrencies}
              saving={saving}
            />
          </TabsContent>

          <TabsContent value="monitor" className="space-y-6">
            <BotStatusCard status={botStatus} />
            <OrderBookViewer selectedSymbols={botConfig.symbols} />
          </TabsContent>

          <TabsContent value="opportunities" className="space-y-6">
            <OpportunitiesList opportunities={opportunities} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}