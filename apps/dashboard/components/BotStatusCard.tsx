import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";

interface BotStatus {
  isRunning: boolean;
  connectedExchanges: string[];
  lastOpportunity: any | null;
  uptime: number;
}

interface BotStatusCardProps {
  status: BotStatus;
}

export function BotStatusCard({ status }: BotStatusCardProps) {
  const formatUptime = (uptime: number) => {
    if (!uptime) return "Not running";
    const hours = Math.floor(uptime / 3600000);
    const minutes = Math.floor((uptime % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🤖 Bot Status
          <Badge variant={status.isRunning ? "default" : "destructive"}>
            {status.isRunning ? "Active" : "Inactive"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Connected Exchanges</p>
            <p className="text-2xl font-bold">{status.connectedExchanges.length}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Uptime</p>
            <p className="text-2xl font-bold">{formatUptime(status.uptime)}</p>
          </div>
        </div>
        
        <div>
          <p className="text-sm text-muted-foreground mb-2">Active Exchanges</p>
          <div className="flex flex-wrap gap-2">
            {status.connectedExchanges.map(exchange => (
              <Badge key={exchange} variant="outline">
                {exchange}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
