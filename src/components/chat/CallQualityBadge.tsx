import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CallQualityBadgeProps {
  rtt?: number;
  packetLoss?: number;
  className?: string;
}

function getQualityLevel(rtt: number, packetLoss: number) {
  if (rtt < 100 && packetLoss < 1) return { label: "Отлично", color: "bg-green-500", dot: "bg-green-400" };
  if (rtt < 300 && packetLoss < 5) return { label: "Хорошо", color: "bg-yellow-500", dot: "bg-yellow-400" };
  return { label: "Плохо", color: "bg-red-500", dot: "bg-red-400" };
}

export function CallQualityBadge({ rtt = 0, packetLoss = 0, className }: CallQualityBadgeProps) {
  const quality = getQualityLevel(rtt, packetLoss);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/30 backdrop-blur-sm", className)}>
          <span className={cn("w-2 h-2 rounded-full animate-pulse", quality.dot)} />
          <span className="text-[10px] font-medium text-white">{quality.label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <div className="space-y-0.5">
          <p>Задержка: {rtt.toFixed(0)} мс</p>
          <p>Потери: {packetLoss.toFixed(1)}%</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
