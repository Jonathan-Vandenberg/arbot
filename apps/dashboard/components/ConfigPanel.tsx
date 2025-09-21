import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Badge } from "@/src/components/ui/badge";

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

interface ConfigPanelProps {
  config: BotConfig;
  exchanges: Exchange[];
  currencies: Currency[];
  onConfigUpdate: (config: BotConfig) => void;
  onExchangeChange?: (exchanges: string[]) => void;
  saving: boolean;
}

export function ConfigPanel({ 
  config, 
  exchanges, 
  currencies, 
  onConfigUpdate, 
  onExchangeChange,
  saving 
}: ConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState({
    ...config,
    orderBookDepth: config.orderBookDepth || 50
  });

  // Update local config when props change
  useEffect(() => {
    setLocalConfig({
      ...config,
      orderBookDepth: config.orderBookDepth || 50
    });
  }, [config]);

  const toggleExchange = (exchangeId: string) => {
    const isSelected = localConfig.exchanges.includes(exchangeId);
    
    if (isSelected) {
      if (localConfig.exchanges.length <= 1) {
        alert('At least one exchange must be selected');
        return;
      }
      // Remove exchange
      const newExchanges = localConfig.exchanges.filter(id => id !== exchangeId);
      setLocalConfig(prev => ({
        ...prev,
        exchanges: newExchanges,
        symbols: prev.symbols.filter(currencyId => 
          isCurrencySupportedByExchanges(currencyId, newExchanges)
        )
      }));
      // Notify parent to refresh currencies
      onExchangeChange?.(newExchanges);
    } else {
      // Add exchange (max 3)
      if (localConfig.exchanges.length >= 3) {
        alert('Maximum 3 exchanges allowed');
        return;
      }
      
      const newExchanges = [...localConfig.exchanges, exchangeId];
      setLocalConfig(prev => ({
        ...prev,
        exchanges: newExchanges,
        symbols: prev.symbols.filter(currencyId => 
          isCurrencySupportedByExchanges(currencyId, newExchanges)
        )
      }));
      // Notify parent to refresh currencies
      onExchangeChange?.(newExchanges);
    }
  };

  const toggleCurrency = (currencyId: string) => {
    const isSelected = localConfig.symbols.includes(currencyId);
    
    if (isSelected) {
      setLocalConfig(prev => ({
        ...prev,
        symbols: prev.symbols.filter(id => id !== currencyId)
      }));
    } else {
      if (localConfig.symbols.length >= 3) {
        alert('Maximum 3 currencies allowed');
        return;
      }
      
      if (!isCurrencySupportedByExchanges(currencyId, localConfig.exchanges)) {
        alert('This currency is not supported by all selected exchanges');
        return;
      }
      
      setLocalConfig(prev => ({
        ...prev,
        symbols: [...prev.symbols, currencyId]
      }));
    }
  };

  const isCurrencySupportedByExchanges = (currencyId: string, _exchangeList: string[]): boolean => {
    const currency = currencies.find(c => c.id === currencyId);
    return !!currency; // If currency exists in our list, it's supported by all exchanges
  };

  const handleSave = () => {
    onConfigUpdate(localConfig);
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Exchange Selection */}
      <Card>
        <CardHeader>
          <CardTitle>🏦 Select Exchanges (Max 3)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {exchanges.map(exchange => {
            const isSelected = localConfig.exchanges.includes(exchange.id);
            const isDisabled = !isSelected && localConfig.exchanges.length >= 3;
            
            return (
              <div
                key={exchange.id}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  isSelected 
                    ? 'border-primary bg-primary/10' 
                    : isDisabled 
                      ? 'border-muted bg-muted/50 opacity-50 cursor-not-allowed'
                      : 'border-border hover:border-primary/50'
                }`}
                onClick={() => !isDisabled && toggleExchange(exchange.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{exchange.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Taker: {exchange.fees.taker}% | Maker: {exchange.fees.maker}%
                    </div>
                  </div>
                  {isSelected && <Badge>Selected</Badge>}
                  {isDisabled && <Badge variant="secondary">Max Reached</Badge>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Currency Selection */}
      <Card>
        <CardHeader>
          <CardTitle>💰 Select Currencies (Max 3)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {currencies.map(currency => {
            const isSupported = isCurrencySupportedByExchanges(currency.id, localConfig.exchanges);
            const isSelected = localConfig.symbols.includes(currency.id);
            const isDisabled = !isSupported || (!isSelected && localConfig.symbols.length >= 3);
            
            return (
              <div
                key={currency.id}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  isSelected 
                    ? 'border-primary bg-primary/10' 
                    : isDisabled 
                      ? 'border-muted bg-muted/50 opacity-50 cursor-not-allowed'
                      : 'border-border hover:border-primary/50'
                }`}
                onClick={() => !isDisabled && toggleCurrency(currency.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{currency.name}</div>
                    <div className="text-sm text-muted-foreground">{currency.pair}</div>
                  </div>
                  {isSelected && <Badge>Selected</Badge>}
                  {!isSupported && <Badge variant="destructive">Not Supported</Badge>}
                  {isDisabled && !isSelected && localConfig.symbols.length >= 3 && (
                    <Badge variant="secondary">Max Reached</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Bot Settings */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>⚙️ Bot Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="text-sm font-medium mb-2 block">💰 Min Profit %</label>
            <input
              type="number"
              step="0.1"
              value={localConfig.minProfitPercent}
              onChange={(e) => setLocalConfig(prev => ({
                ...prev,
                minProfitPercent: parseFloat(e.target.value) || 0
              }))}
              className="w-full p-2 rounded-md border bg-background"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">📊 Trade Amount</label>
            <input
              type="number"
              step="0.001"
              value={localConfig.tradeAmount}
              onChange={(e) => setLocalConfig(prev => ({
                ...prev,
                tradeAmount: parseFloat(e.target.value) || 0
              }))}
              className="w-full p-2 rounded-md border bg-background"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">📈 Order Book Depth</label>
            <Select
              value={localConfig.orderBookDepth?.toString() || "50"}
              onValueChange={(value) => setLocalConfig(prev => ({
                ...prev,
                orderBookDepth: parseInt(value) || 50
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 levels (Ultra Fast)</SelectItem>
                <SelectItem value="25">25 levels (Fast)</SelectItem>
                <SelectItem value="50">50 levels (Balanced)</SelectItem>
                <SelectItem value="100">100 levels (Deep)</SelectItem>
                <SelectItem value="200">200 levels (Maximum)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="w-full"
            >
              {saving ? 'Saving...' : '💾 Save Configuration'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
