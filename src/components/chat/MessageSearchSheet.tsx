import { useState, useRef, useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { X, Search } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useMessageSearch, MediaFilter, DateFilter } from "@/hooks/useMessageSearch";
import { GradientAvatar } from "@/components/ui/gradient-avatar";

interface MessageSearchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
  onSelectMessage?: (messageId: string, conversationId: string) => void;
}

const MEDIA_FILTERS: { label: string; value: MediaFilter }[] = [
  { label: "Все", value: "all" },
  { label: "Фото", value: "photo" },
  { label: "Видео", value: "video" },
  { label: "Файлы", value: "file" },
  { label: "Голосовые", value: "voice" },
];

const DATE_FILTERS: { label: string; value: DateFilter }[] = [
  { label: "За сегодня", value: "today" },
  { label: "За неделю", value: "week" },
  { label: "За месяц", value: "month" },
];

function HighlightedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded px-0.5">
            {part.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export function MessageSearchSheet({ open, onOpenChange, conversationId, onSelectMessage }: MessageSearchSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const { results, loading, search, filters, setFilters, loadMore, totalCount } = useMessageSearch(conversationId);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      search("");
    }
  }, [open, search]);

  const handleQuery = (val: string) => {
    setQuery(val);
    search(val);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-[#1c1c1e] border-white/10 rounded-t-2xl h-[92vh] flex flex-col p-0">
        {/* Search bar */}
        <div className="flex items-center gap-2 px-3 pt-4 pb-2 shrink-0">
          <div className="flex-1 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-white/40 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => handleQuery(e.target.value)}
              placeholder="Поиск в чате..."
              className="flex-1 bg-transparent text-white placeholder:text-white/40 text-sm outline-none"
            />
            {query && (
              <button onClick={() => handleQuery("")} className="text-white/40 hover:text-white/70">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-[#6ab3f3] text-sm font-medium shrink-0"
          >
            Отмена
          </button>
        </div>

        {/* Media type chips */}
        <div className="flex gap-2 px-3 pb-2 overflow-x-auto shrink-0 scrollbar-hide">
          {MEDIA_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilters((prev) => ({ ...prev, mediaType: f.value }))}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filters.mediaType === f.value
                  ? "bg-[#6ab3f3] text-black"
                  : "bg-white/10 text-white/70 hover:bg-white/15"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Date chips */}
        <div className="flex gap-2 px-3 pb-3 overflow-x-auto shrink-0 scrollbar-hide border-b border-white/5">
          <button
            onClick={() => setFilters((prev) => ({ ...prev, dateFilter: "all" }))}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filters.dateFilter === "all"
                ? "bg-white/20 text-white"
                : "bg-transparent text-white/50 hover:text-white/70"
            }`}
          >
            Всё время
          </button>
          {DATE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilters((prev) => ({ ...prev, dateFilter: f.value }))}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filters.dateFilter === f.value
                  ? "bg-white/20 text-white"
                  : "bg-transparent text-white/50 hover:text-white/70"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {!query.trim() && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-white/30">
              <Search className="w-10 h-10" />
              <p className="text-sm">Введите текст для поиска</p>
            </div>
          )}

          {query.trim() && !loading && results.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-white/30">
              <p className="text-sm">Ничего не найдено</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white/30" />
            </div>
          )}

          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onSelectMessage?.(r.id, r.conversation_id);
                onOpenChange(false);
              }}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 text-left"
            >
              <GradientAvatar
                name={r.sender_name || "?"}
                seed={r.sender_id}
                avatarUrl={r.sender_avatar}
                size="sm"
                className="shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-sm font-medium text-white truncate">
                    {r.sender_name || "Пользователь"}
                  </span>
                  <span className="text-[10px] text-white/40 shrink-0">
                    {format(new Date(r.created_at), "d MMM HH:mm", { locale: ru })}
                  </span>
                </div>
                <p className="text-xs text-white/60 truncate">
                  <HighlightedText text={r.highlight} />
                </p>
              </div>
            </button>
          ))}

          {results.length > 0 && results.length < totalCount && (
            <button
              onClick={loadMore}
              className="w-full py-3 text-sm text-[#6ab3f3] hover:text-[#6ab3f3]/80 transition-colors"
            >
              Загрузить ещё ({totalCount - results.length})
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
