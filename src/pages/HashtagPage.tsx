import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Hash, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { normalizeReelMediaUrl } from "@/hooks/useReels";

type HashtagPagePayload = {
  hashtag: string;
  generated_at: string;
  status: "normal" | "restricted" | "hidden" | string;
  sections: Array<{ type: string; items: any[] }>;
};

function normalizeTag(raw: string | undefined): string {
  const t = String(raw || "").trim();
  return t.startsWith("#") ? t.slice(1) : t;
}

export function HashtagPage() {
  const navigate = useNavigate();
  const params = useParams();
  const tag = useMemo(() => normalizeTag(params.tag), [params.tag]);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HashtagPagePayload | null>(null);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!tag) return;
      setLoading(true);
      try {
        const { data: payload, error } = await (supabase as any).rpc("get_hashtag_page_v1", {
          p_hashtag: tag,
          p_section: "top",
          p_limit: 30,
          p_offset: 0,
        });
        if (error) throw error;
        if (!mounted) return;
        setData(payload as HashtagPagePayload);
      } catch (e) {
        console.error("HashtagPage load failed:", e);
        if (!mounted) return;
        setData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [tag]);

  const topSection = useMemo(() => {
    const sections = data?.sections || [];
    return sections.find((s) => s.type === "top") || null;
  }, [data]);

  const related = useMemo(() => {
    const sections = data?.sections || [];
    return sections.find((s) => s.type === "related_tags")?.items || [];
  }, [data]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border safe-area-top">
        <div className="flex items-center h-12 px-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full hover:bg-muted transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="font-semibold text-lg ml-2 flex items-center gap-2">
            <Hash className="w-5 h-5 text-muted-foreground" />
            <span>#{tag}</span>
          </h1>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          {data.status !== "normal" ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Этот хештег ограничен.
            </div>
          ) : null}

          {related.length > 0 ? (
            <div className="px-4 py-3">
              <div className="text-sm font-medium mb-2">Похожие теги</div>
              <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex gap-2">
                  {related.map((r: any) => (
                    <button
                      key={String(r?.hashtag ?? "")}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                      onClick={() => navigate(`/hashtag/${encodeURIComponent(String(r?.hashtag ?? ""))}`)}
                    >
                      <Hash className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{String(r?.hashtag ?? "")}</span>
                    </button>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" className="h-0" />
              </ScrollArea>
            </div>
          ) : null}

          <div className="px-1">
            {topSection?.items?.length ? (
              <div className="grid grid-cols-3 gap-[2px]">
                {topSection.items.map((it: any) => (
                  <div
                    key={String(it?.reel_id ?? "")}
                    className="aspect-square relative overflow-hidden bg-muted"
                  >
                    {it?.thumbnail_url ? (
                      <img
                        src={normalizeReelMediaUrl(it.thumbnail_url, "reels-media") || it.thumbnail_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        Reel
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Hash className="w-12 h-12 mb-2 opacity-20" />
                <p>Пока нет роликов по этому тегу</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Hash className="w-12 h-12 mb-2 opacity-20" />
          <p>Не удалось загрузить тег</p>
        </div>
      )}
    </div>
  );
}
