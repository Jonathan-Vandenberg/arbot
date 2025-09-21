import { Badge } from "@/src/components/ui/badge";

interface HeaderProps {
  isRunning: boolean;
  connectedExchanges: string[];
}

export function Header({ isRunning, connectedExchanges }: HeaderProps) {
  return (
    <div className="p-6 border-b bg-gradient-to-r from-card to-muted/50">
      <div className="flex items-center gap-4 mt-2">
        <Badge variant={isRunning ? "default" : "destructive"}>
          {isRunning ? "🟢 Running" : "🔴 Stopped"}
        </Badge>
        <Badge variant="outline">
          {connectedExchanges.length} Exchanges Connected
        </Badge>
      </div>
    </div>
  );
}
