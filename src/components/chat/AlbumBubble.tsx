import { Check, CheckCheck, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlbumBubbleProps {
  mediaUrls: string[];
  mediaTypes: ("image" | "video")[];
  caption?: string;
  isOwn: boolean;
  timestamp: string;
  isRead: boolean;
  onMediaClick: (index: number) => void;
}

function getLayoutClass(count: number, idx: number): string {
  if (count === 2) return "col-span-1 row-span-1";
  if (count === 3) {
    if (idx === 0) return "col-span-1 row-span-2";
    return "col-span-1 row-span-1";
  }
  if (count === 4) return "col-span-1 row-span-1";
  // 5+
  if (idx < 2) return "col-span-1 row-span-1";
  return "col-span-1 row-span-1";
}

function getGridTemplate(count: number) {
  if (count === 2) return { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "200px" };
  if (count === 3) return { gridTemplateColumns: "2fr 1fr", gridTemplateRows: "100px 100px" };
  if (count === 4) return { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "140px 140px" };
  // 5+: 2 сверху + остальные снизу
  const bottomCount = count - 2;
  return {
    gridTemplateColumns: `repeat(${Math.max(2, bottomCount)}, 1fr)`,
    gridTemplateRows: "140px 100px",
  };
}

function getItemStyle(count: number, idx: number): React.CSSProperties | undefined {
  if (count === 3 && idx === 0) {
    return { gridRow: "1 / 3" };
  }
  if (count >= 5) {
    if (idx < 2) {
      const bottomCount = count - 2;
      const colSpan = Math.max(1, Math.floor(bottomCount / 2));
      return { gridColumn: idx === 0 ? `1 / ${colSpan + 1}` : `${colSpan + 1} / -1` };
    }
  }
  return undefined;
}

function formatTime(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function AlbumBubble({
  mediaUrls,
  mediaTypes,
  caption,
  isOwn,
  timestamp,
  isRead,
  onMediaClick,
}: AlbumBubbleProps) {
  const count = mediaUrls.length;
  if (count === 0) return null;

  const gridStyle = getGridTemplate(count);
  const isLast = (idx: number) => idx === count - 1;
  const showMetaOnImage = !caption;

  return (
    <div className={cn("max-w-[320px] md:max-w-[400px]", isOwn ? "ml-auto" : "mr-auto")}>
      <div className="rounded-2xl overflow-hidden" style={{ gap: 2, display: "grid", ...gridStyle }}>
        {mediaUrls.map((url, idx) => (
          <button
            key={idx}
            className={cn("relative overflow-hidden bg-muted focus:outline-none", getLayoutClass(count, idx))}
            style={{ ...getItemStyle(count, idx), gap: 0, margin: 0, padding: 0 }}
            onClick={() => onMediaClick(idx)}
            aria-label={`Медиа ${idx + 1} из ${count}`}
          >
            {mediaTypes[idx] === "video" ? (
              <>
                <video src={url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                    <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                  </div>
                </div>
              </>
            ) : (
              <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
            )}

            {showMetaOnImage && isLast(idx) && (
              <div className="absolute bottom-1 right-1.5 flex items-center gap-1 bg-black/40 rounded-full px-1.5 py-0.5">
                <span className="text-[11px] text-white">{formatTime(timestamp)}</span>
                {isOwn && (isRead
                  ? <CheckCheck className="w-3.5 h-3.5 text-blue-300" />
                  : <Check className="w-3.5 h-3.5 text-white/70" />
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      {caption && (
        <div className={cn(
          "px-3 py-1.5 text-sm",
          isOwn ? "bg-primary/10 dark:bg-primary/20" : "bg-muted",
          "rounded-b-2xl -mt-1",
        )}>
          <p className="whitespace-pre-wrap break-words">{caption}</p>
          <div className={cn("flex items-center gap-1 mt-0.5", isOwn ? "justify-end" : "justify-start")}>
            <span className="text-[11px] text-muted-foreground">{formatTime(timestamp)}</span>
            {isOwn && (isRead
              ? <CheckCheck className="w-3.5 h-3.5 text-primary" />
              : <Check className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
