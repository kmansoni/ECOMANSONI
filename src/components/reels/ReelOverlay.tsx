import { Music2, UserPlus, MoreVertical } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { RankingExplanation } from "@/components/reel/RankingExplanation";

interface ReelOverlayProps {
  reel: any;
  user: any;
  followedAuthors: Set<string>;
  expandedDescriptions: Set<string>;
  onAuthorClick: () => void;
  onFollow: () => void;
  onHashtagClick: (tag: string) => void;
  onMusicClick: () => void;
  onExpandDescription: () => void;
  onContextMenu: () => void;
}

export function ReelOverlay({
  reel,
  user,
  followedAuthors,
  expandedDescriptions,
  onAuthorClick,
  onFollow,
  onHashtagClick,
  onMusicClick,
  onExpandDescription,
  onContextMenu,
}: ReelOverlayProps) {
  const isExpanded = expandedDescriptions.has(reel.id);
  const isLong = (reel.description || "").length > 80;

  return (
    <div
      className="absolute left-4 right-20 bottom-3 z-10"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Author name + follow button */}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          className="text-white font-semibold text-sm hover:underline"
          onClick={(e) => { e.stopPropagation(); onAuthorClick(); }}
        >
          @{reel.author?.display_name || "user"}
        </button>
        {reel.author?.verified && <VerifiedBadge size="sm" />}
        {user && reel.author_id !== user.id && !followedAuthors.has(reel.author_id) && (
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/60 text-white/80 text-xs hover:bg-white/20 transition-colors"
            onClick={(e) => { e.stopPropagation(); onFollow(); }}
          >
            <UserPlus className="w-3 h-3" />
            Подписаться
          </button>
        )}
        {/* Context menu button */}
        <button
          type="button"
          className="ml-auto p-1 text-white/60 hover:text-white"
          onClick={(e) => { e.stopPropagation(); onContextMenu(); }}
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Description with "more" button and clickable hashtags */}
      {reel.description && (() => {
        const text = isExpanded || !isLong ? reel.description : reel.description.slice(0, 80) + "…";
        const parts = text.split(/(#\w+)/g);
        return (
          <div className="mb-3">
            <p className="text-white/90 text-sm">
              {parts.map((part: string, i: number) =>
                part.startsWith('#') ? (
                  <button
                    key={i}
                    type="button"
                    className="text-blue-300 hover:underline"
                    onClick={(e) => { e.stopPropagation(); onHashtagClick(part.slice(1)); }}
                  >
                    {part}
                  </button>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </p>
            {isLong && (
              <button
                type="button"
                className="text-white/60 text-xs mt-0.5"
                onClick={(e) => { e.stopPropagation(); onExpandDescription(); }}
              >
                {isExpanded ? "Скрыть" : "Ещё"}
              </button>
            )}
          </div>
        );
      })()}

      {reel.music_title && (
        <button
          className="flex items-center gap-2 mb-3"
          onClick={(e) => { e.stopPropagation(); onMusicClick(); }}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center animate-spin-slow">
            <Music2 className="w-4 h-4 text-white" />
          </div>
          <span className="text-white/80 text-sm">{reel.music_title}</span>
        </button>
      )}

      <div className="text-white/80">
        <RankingExplanation
          algorithm_version={reel.algorithm_version}
          final_score={reel.final_score}
          ranking_reason={reel.ranking_reason}
          source_pool={reel.source_pool}
          feed_position={reel.feed_position}
        />
      </div>
    </div>
  );
}
