import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";

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

interface OpportunitiesListProps {
  opportunities: ArbitrageOpportunity[];
}

export function OpportunitiesList({ opportunities }: OpportunitiesListProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(value);
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (opportunities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>💰 Latest Opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No arbitrage opportunities detected yet...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          💰 Latest Opportunities
          <Badge variant="outline">{opportunities.length} found</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {opportunities.slice(0, 10).map((opportunity) => (
            <div
              key={opportunity.id}
              className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{opportunity.symbol}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {formatTime(opportunity.timestamp)}
                  </span>
                </div>
                <Badge 
                  variant={opportunity.profitPercent > 1 ? "default" : "secondary"}
                  className="font-mono"
                >
                  +{opportunity.profitPercent.toFixed(2)}%
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Buy from</p>
                  <p className="font-semibold">
                    {opportunity.buyExchange} @ {formatCurrency(opportunity.buyPrice)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sell to</p>
                  <p className="font-semibold">
                    {opportunity.sellExchange} @ {formatCurrency(opportunity.sellPrice)}
                  </p>
                </div>
              </div>
              
              <div className="mt-2 pt-2 border-t">
                <p className="text-sm">
                  <span className="text-muted-foreground">Net Profit: </span>
                  <span className="font-semibold text-green-400">
                    {formatCurrency(opportunity.netProfit)}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
