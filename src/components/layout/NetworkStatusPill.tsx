import { cn } from "@/lib/utils";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export function NetworkStatusPill() {
  const { isOnline } = useNetworkStatus();

  return (
    <div className="fixed top-3 right-3 z-[120] pointer-events-none safe-area-top">
      <div
        className={cn(
          "flex items-center gap-2",
          "px-3 py-1.5 rounded-full",
          "bg-card/80 backdrop-blur-xl",
          "border border-border/60",
          "text-xs font-medium",
        )}
      >
        <span
          className={cn(
            "inline-block w-2 h-2 rounded-full",
            isOnline ? "bg-primary" : "bg-destructive",
          )}
        />
        <span className={cn(isOnline ? "text-foreground" : "text-destructive")}> {isOnline ? "В сети" : "Не в сети"}</span>
      </div>
    </div>
  );
}
