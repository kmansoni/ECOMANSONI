import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  highlight: string; // подсвеченный фрагмент
}

const LIMIT = 20;

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

export function useMessageSearch(conversationId?: string) {
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

  const doSearch = useCallback(
    async (query: string, theFilters: SearchFilters, theOffset: number, append = false) => {
      if (!query.trim()) {
        setResults([]);
        setTotalCount(0);
        return;
      }
      setLoading(true);

      let q = (supabase as any)
        .from("messages")
        .select(
          `id, content, sender_id, conversation_id, created_at, media_type, media_url,
           profiles:sender_id(display_name, avatar_url)`,
          { count: "exact" }
        )
        .ilike("content", `%${query}%`)
        .order("created_at", { ascending: false })
        .range(theOffset, theOffset + LIMIT - 1);

      if (conversationId) {
        q = q.eq("conversation_id", conversationId);
      }

      // Фильтр по типу медиа
      if (theFilters.mediaType === "photo") q = q.eq("media_type", "image");
      else if (theFilters.mediaType === "video") q = q.eq("media_type", "video");
      else if (theFilters.mediaType === "voice") q = q.eq("media_type", "voice");
      else if (theFilters.mediaType === "file") q = q.eq("media_type", "file");

      // Фильтр по дате
      const dateRange = buildDateRange(theFilters.dateFilter, theFilters.dateFrom, theFilters.dateTo);
      if (dateRange) {
        q = q.gte("created_at", dateRange.from).lte("created_at", dateRange.to);
      }

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

      if (append) {
        setResults((prev) => [...prev, ...mapped]);
      } else {
        setResults(mapped);
      }
      setTotalCount(count || 0);
    },
    [conversationId]
  );

  const search = useCallback(
    (query: string) => {
      setCurrentQuery(query);
      setOffset(0);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        doSearch(query, filters, 0, false);
      }, 300);
    },
    [doSearch, filters]
  );

  // Re-search when filters change
  useEffect(() => {
    if (!currentQuery.trim()) return;
    setOffset(0);
    doSearch(currentQuery, filters, 0, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const loadMore = useCallback(() => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    doSearch(currentQuery, filters, newOffset, true);
  }, [offset, currentQuery, filters, doSearch]);

  return { results, loading, search, filters, setFilters, loadMore, totalCount };
}
