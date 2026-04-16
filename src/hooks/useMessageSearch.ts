import { useState, useEffect, useCallback, useRef } from "react";
import { dbLoose } from "@/lib/supabase";

export type MediaFilter = "all" | "photo" | "video" | "file" | "link" | "voice";
export type DateFilter = "all" | "today" | "week" | "month" | "custom";

export interface SearchFilters {
  mediaType: MediaFilter;
  dateFilter: DateFilter;
  dateFrom?: string;
  dateTo?: string;
  senderId?: string;
}

export interface SearchResult {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string | null;
  sender_avatar: string | null;
  conversation_id: string;
  created_at: string;
  media_type: string | null;
  media_url: string | null;
  highlight: string;
}

/**
 * Запись для локального поиска по E2EE чату. Сервер хранит шифротекст, поэтому
 * `.ilike("content", …)` по ciphertext бессмысленен — индексируем уже расшифрованные
 * сообщения из decryptedCache и фильтруем в памяти.
 */
export interface LocalSearchMessage {
  id: string;
  decryptedText: string;
  sender_id: string;
  sender_name: string | null;
  sender_avatar: string | null;
  conversation_id: string;
  created_at: string;
  media_type: string | null;
  media_url: string | null;
}

const LIMIT = 20;
const URL_REGEX_FILTER = /https?:\/\/[^\s"'<>()[\]{}]+/i;

function highlightText(text: string, query: string): string {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), "**$1**");
}

function buildDateRange(dateFilter: DateFilter, dateFrom?: string, dateTo?: string) {
  const now = new Date();
  if (dateFilter === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (dateFilter === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (dateFilter === "month") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (dateFilter === "custom" && dateFrom) {
    return { from: dateFrom, to: dateTo || now.toISOString() };
  }
  return null;
}

function matchesMediaFilter(mediaType: string | null, filter: MediaFilter, text: string): boolean {
  if (filter === "all") return true;
  if (filter === "photo") return mediaType === "image";
  if (filter === "video") return mediaType === "video";
  if (filter === "voice") return mediaType === "voice";
  if (filter === "file") return mediaType === "file";
  if (filter === "link") return URL_REGEX_FILTER.test(text);
  return true;
}

/**
 * Хук поиска по сообщениям.
 *
 * Режимы:
 * - `localMessages` задан → локальный поиск (для E2EE чатов: шифротекст на сервере
 *   не matchается). Фильтры mediaType/date/sender применяются в памяти.
 * - `localMessages` не задан → серверный `.ilike("content", …)` (для plaintext
 *   контекстов: каналы, системные сообщения, global-search по публичному контенту).
 */
export function useMessageSearch(
  conversationId?: string,
  localMessages?: LocalSearchMessage[],
) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [currentQuery, setCurrentQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({
    mediaType: "all",
    dateFilter: "all",
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localRef = useRef<LocalSearchMessage[] | undefined>(localMessages);
  localRef.current = localMessages;

  const doLocalSearch = useCallback(
    (query: string, theFilters: SearchFilters, theOffset: number, append: boolean) => {
      const source = localRef.current ?? [];
      const q = query.trim().toLowerCase();
      if (!q) {
        setResults([]);
        setTotalCount(0);
        return;
      }

      const range = buildDateRange(theFilters.dateFilter, theFilters.dateFrom, theFilters.dateTo);
      const rangeFrom = range ? Date.parse(range.from) : null;
      const rangeTo = range ? Date.parse(range.to) : null;

      const filtered = source
        .filter((m) => {
          if (theFilters.senderId && m.sender_id !== theFilters.senderId) return false;
          if (!matchesMediaFilter(m.media_type, theFilters.mediaType, m.decryptedText)) return false;
          if (rangeFrom !== null && rangeTo !== null) {
            const t = Date.parse(m.created_at);
            if (!Number.isFinite(t) || t < rangeFrom || t > rangeTo) return false;
          }
          return m.decryptedText.toLowerCase().includes(q);
        })
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      const page = filtered.slice(theOffset, theOffset + LIMIT);
      const mapped: SearchResult[] = page.map((m) => ({
        id: m.id,
        content: m.decryptedText,
        sender_id: m.sender_id,
        sender_name: m.sender_name,
        sender_avatar: m.sender_avatar,
        conversation_id: m.conversation_id,
        created_at: m.created_at,
        media_type: m.media_type,
        media_url: m.media_url,
        highlight: highlightText(m.decryptedText, query),
      }));

      if (append) setResults((prev) => [...prev, ...mapped]);
      else setResults(mapped);
      setTotalCount(filtered.length);
    },
    [],
  );

  const doServerSearch = useCallback(
    async (query: string, theFilters: SearchFilters, theOffset: number, append: boolean) => {
      if (!query.trim()) {
        setResults([]);
        setTotalCount(0);
        return;
      }
      setLoading(true);

      let q = dbLoose
        .from("messages")
        .select(
          `id, content, sender_id, conversation_id, created_at, media_type, media_url,
           profiles:sender_id(display_name, avatar_url)`,
          { count: "exact" },
        )
        .ilike("content", `%${query}%`)
        .order("created_at", { ascending: false })
        .range(theOffset, theOffset + LIMIT - 1);

      if (conversationId) q = q.eq("conversation_id", conversationId);

      if (theFilters.mediaType === "photo") q = q.eq("media_type", "image");
      else if (theFilters.mediaType === "video") q = q.eq("media_type", "video");
      else if (theFilters.mediaType === "voice") q = q.eq("media_type", "voice");
      else if (theFilters.mediaType === "file") q = q.eq("media_type", "file");

      const dateRange = buildDateRange(theFilters.dateFilter, theFilters.dateFrom, theFilters.dateTo);
      if (dateRange) q = q.gte("created_at", dateRange.from).lte("created_at", dateRange.to);

      const { data, count, error } = await q;
      setLoading(false);
      if (error || !data) return;

      const mapped: SearchResult[] = data.map((m: any) => ({
        id: m.id,
        content: m.content || "",
        sender_id: m.sender_id,
        sender_name: m.profiles?.display_name || null,
        sender_avatar: m.profiles?.avatar_url || null,
        conversation_id: m.conversation_id,
        created_at: m.created_at,
        media_type: m.media_type,
        media_url: m.media_url,
        highlight: highlightText(m.content || "", query),
      }));

      if (append) setResults((prev) => [...prev, ...mapped]);
      else setResults(mapped);
      setTotalCount(count || 0);
    },
    [conversationId],
  );

  const runSearch = useCallback(
    async (query: string, theFilters: SearchFilters, theOffset: number, append = false) => {
      if (localRef.current !== undefined) {
        doLocalSearch(query, theFilters, theOffset, append);
      } else {
        await doServerSearch(query, theFilters, theOffset, append);
      }
    },
    [doLocalSearch, doServerSearch],
  );

  const search = useCallback(
    (query: string) => {
      setCurrentQuery(query);
      setOffset(0);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void runSearch(query, filters, 0, false);
      }, 300);
    },
    [runSearch, filters],
  );

  useEffect(() => {
    if (!currentQuery.trim()) return;
    setOffset(0);
    void runSearch(currentQuery, filters, 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const loadMore = useCallback(() => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    void runSearch(currentQuery, filters, newOffset, true);
  }, [offset, currentQuery, filters, runSearch]);

  return { results, loading, search, filters, setFilters, loadMore, totalCount };
}