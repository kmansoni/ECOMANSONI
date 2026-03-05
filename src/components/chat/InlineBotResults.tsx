/**
 * InlineBotResults — popup with inline bot query results.
 *
 * Triggered when user types "@botname query" in the message input.
 * Shows results from the bot API in a scrollable list.
 * Selecting a result sends it as a message.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Image, FileText, MapPin, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface InlineBotResult {
  id: string;
  type: "article" | "photo" | "gif" | "video" | "location" | "document";
  title: string;
  description?: string;
  thumbnailUrl?: string;
  /** The content to send when this result is selected */
  sendContent: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
  };
}

interface InlineBotResultsProps {
  /** Bot username (without @) */
  botUsername: string;
  /** The query text after @botname */
  query: string;
  /** Called when user selects a result */
  onSelectResult: (result: InlineBotResult) => void;
  /** Called to dismiss the popup */
  onDismiss: () => void;
}

const TYPE_ICONS: Record<string, typeof Bot> = {
  article: FileText,
  photo: Image,
  gif: Image,
  video: Image,
  location: MapPin,
  document: FileText,
};

export function InlineBotResults({ botUsername, query, onSelectResult, onDismiss }: InlineBotResultsProps) {
  const [results, setResults] = useState<InlineBotResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call bot API for inline query results
      const { data, error: rpcError } = await (supabase as any).rpc("bot_inline_query", {
        bot_username: botUsername,
        query_text: query,
        limit_count: 20,
      });

      if (rpcError) {
        // Bot API not available — show placeholder results
        console.warn("[InlineBot] RPC not available:", rpcError);
        setResults([
          {
            id: "placeholder-1",
            type: "article",
            title: `Результат для "${query}"`,
            description: `Inline-бот @${botUsername} пока не подключён`,
            sendContent: { text: query },
          },
        ]);
        return;
      }

      setResults((data ?? []) as InlineBotResult[]);
    } catch {
      setError("Не удалось загрузить результаты");
    } finally {
      setLoading(false);
    }
  }, [botUsername, query]);

  // Debounced fetch
  useEffect(() => {
    const timer = setTimeout(fetchResults, 300);
    return () => clearTimeout(timer);
  }, [fetchResults]);

  if (!query && results.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="absolute bottom-full left-0 right-0 mb-1 mx-2 max-h-[300px] overflow-y-auto rounded-2xl bg-[#17212b] border border-white/10 shadow-xl z-30"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 sticky top-0 bg-[#17212b]/95 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-medium text-white/70">@{botUsername}</span>
          </div>
          <button onClick={onDismiss} className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center">
            <X className="w-3.5 h-3.5 text-white/50" />
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-3 py-3 text-xs text-red-400 text-center">{error}</div>
        )}

        {/* Results */}
        {!loading && results.map((result) => {
          const Icon = TYPE_ICONS[result.type] ?? Bot;
          return (
            <motion.button
              key={result.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectResult(result)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
            >
              {result.thumbnailUrl ? (
                <img src={result.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-white/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{result.title}</p>
                {result.description && (
                  <p className="text-xs text-white/40 truncate">{result.description}</p>
                )}
              </div>
            </motion.button>
          );
        })}

        {/* Empty state */}
        {!loading && !error && results.length === 0 && query && (
          <div className="px-3 py-4 text-xs text-white/30 text-center">
            Нет результатов для «{query}»
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Detects inline bot trigger in input text.
 * Returns { botUsername, query } or null.
 * Pattern: @botname query text
 */
export function detectInlineBotTrigger(text: string): { botUsername: string; query: string } | null {
  const match = text.match(/^@(\w+)\s+(.*)/);
  if (!match) return null;
  return { botUsername: match[1], query: match[2] };
}
