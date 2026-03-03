import { Lock, Timer } from "lucide-react";

interface SecretChatBannerProps {
  ttlSeconds?: number;
}

export function SecretChatBanner({ ttlSeconds }: SecretChatBannerProps) {
  const formatTtl = (s: number) => {
    if (s < 60) return `${s}с`;
    if (s < 3600) return `${Math.round(s / 60)}м`;
    return `${Math.round(s / 3600)}ч`;
  };

  return (
    <div className="flex items-center justify-between px-3 h-8 bg-gradient-to-r from-emerald-600/30 to-emerald-500/20 border-b border-emerald-500/20">
      <div className="flex items-center gap-1.5">
        <Lock className="w-3 h-3 text-emerald-400" />
        <span className="text-xs font-medium text-emerald-300">Секретный чат</span>
        <span className="text-[10px] text-emerald-400/70">· end-to-end шифрование</span>
      </div>
      {ttlSeconds !== undefined && ttlSeconds > 0 && (
        <div className="flex items-center gap-1 text-emerald-400">
          <Timer className="w-3 h-3" />
          <span className="text-[10px] font-medium">{formatTtl(ttlSeconds)}</span>
        </div>
      )}
    </div>
  );
}
