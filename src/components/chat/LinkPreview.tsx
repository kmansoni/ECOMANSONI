/**
 * LinkPreview — renders an Open Graph card below a message bubble.
 *
 * Design: Telegram-style — compact card with left blue accent stripe,
 * optional hero image, title, description, domain + favicon.
 *
 * Security:
 * - All string content is rendered as text (no dangerouslySetInnerHTML).
 * - Image src comes from OG metadata fetched via proxy; CSP must allow it.
 * - External link uses rel="noopener noreferrer" + target="_blank".
 */
import { useState, useEffect } from "react";
import { fetchPreview, type LinkPreviewData } from "@/hooks/useLinkPreview";

interface LinkPreviewProps {
  url: string;
  /** If false the component renders nothing (respects user setting). */
  enabled?: boolean;
}

function Skeleton() {
  return (
    <div className="animate-pulse flex gap-3 rounded-xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl p-3">
      <div className="w-1 shrink-0 rounded-full bg-[#6ab3f3]/40" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-white/15 rounded w-3/4" />
        <div className="h-2 bg-white/10 rounded w-full" />
        <div className="h-2 bg-white/10 rounded w-5/6" />
        <div className="h-2 bg-white/8 rounded w-1/3 mt-1" />
      </div>
    </div>
  );
}

export function LinkPreview({ url, enabled = true }: LinkPreviewProps) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setData(null);

    fetchPreview(url)
      .then((result) => {
        if (cancelled) return;
        // If neither title nor description was found AND no image — treat as failed
        // to avoid rendering a meaningless domain-only card for every URL.
        if (!result.title && !result.description && !result.image) {
          setFailed(true);
        } else {
          setData(result);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url, enabled]);

  if (!enabled || failed) return null;
  if (loading) return <Skeleton />;
  if (!data) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 rounded-xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl hover:bg-white/10 transition-colors no-underline"
    >
      {/* Hero image */}
      {data.image && (
        <div className="w-full max-h-[180px] overflow-hidden" style={{ aspectRatio: '16/9' }}>
          <img
            loading="lazy"
            src={data.image}
            alt={data.title ?? "Preview"}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      {/* Card body */}
      <div className="flex gap-3 p-3">
        {/* Blue left stripe — Telegram style */}
        <div className="w-1 shrink-0 rounded-full bg-[#6ab3f3] self-stretch" />

        <div className="flex-1 min-w-0 space-y-1">
          {data.title && (
            <p className="text-[13px] font-semibold text-white leading-tight line-clamp-2">
              {data.title}
            </p>
          )}
          {data.description && (
            <p className="text-[12px] text-white/60 leading-snug line-clamp-3">
              {data.description}
            </p>
          )}

          {/* Domain + favicon row */}
          <div className="flex items-center gap-1.5 pt-0.5">
            {data.favicon && (
              <img
                loading="lazy"
                src={data.favicon}
                alt=""
                className="w-3.5 h-3.5 rounded-sm object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <span className="text-[11px] text-[#6ab3f3] truncate">
              {data.domain}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
