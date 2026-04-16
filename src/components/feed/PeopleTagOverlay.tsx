/**
 * PeopleTagOverlay — отметка людей на фото
 * Тап на фото → поиск пользователя → позиционирование тега
 */
import React, { useState, useRef } from "react";
import { X, Search, UserCheck } from "lucide-react";
import { dbLoose } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export interface PeopleTag {
  id?: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  x: number; // 0..1
  y: number; // 0..1
  media_index: number;
}

interface UserResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
}

interface Props {
  tags: PeopleTag[];
  mediaIndex: number;
  onAddTag: (tag: PeopleTag) => void;
  onRemoveTag: (userId: string) => void;
  showTags?: boolean; // для просмотра без редактирования
  readOnly?: boolean;
}

export function PeopleTagOverlay({ tags, mediaIndex, onAddTag, onRemoveTag, showTags = true, readOnly = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [tagsVisible, setTagsVisible] = useState(false);

  const currentTags = tags.filter((t) => t.media_index === mediaIndex);

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly) {
      setTagsVisible((v) => !v);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPendingPos({ x, y });
    setSearchQuery("");
    setSearchResults([]);
  };

  const searchUsers = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data } = await dbLoose
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .ilike("username", `%${q}%`)
        .limit(8);
      setSearchResults((data || []) as UserResult[]);
    } finally {
      setSearching(false);
    }
  };

  const selectUser = (u: UserResult) => {
    if (!pendingPos) return;
    onAddTag({
      user_id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      x: pendingPos.x,
      y: pendingPos.y,
      media_index: mediaIndex,
    });
    setPendingPos(null);
    setSearchQuery("");
  };

  return (
    <div ref={containerRef} className="absolute inset-0" onClick={handleImageClick}>
      {/* Теги */}
      {(showTags || tagsVisible || !readOnly) && currentTags.map((tag) => (
        <div
          key={tag.user_id}
          className="absolute z-10 transform -translate-x-1/2 -translate-y-full"
          style={{ left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex flex-col items-center">
            <div className="bg-black/80 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full flex items-center gap-1.5 shadow-lg">
              {tag.avatar_url && (
                <img loading="lazy" src={tag.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
              )}
              <span>@{tag.username}</span>
              {!readOnly && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveTag(tag.user_id); }}
                  className="ml-0.5 opacity-70 hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="w-px h-2 bg-white/60" />
            <div className="w-1.5 h-1.5 rounded-full bg-white" />
          </div>
        </div>
      ))}

      {/* Точка ожидания */}
      {pendingPos && (
        <div
          className="absolute w-4 h-4 rounded-full bg-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-10 animate-pulse"
          style={{ left: `${pendingPos.x * 100}%`, top: `${pendingPos.y * 100}%` }}
        />
      )}

      {/* Поиск пользователей */}
      {pendingPos && (
        <div
          className="absolute bottom-4 left-4 right-4 z-20 bg-zinc-900/95 backdrop-blur-sm rounded-2xl p-3 border border-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2 mb-2">
            <Search className="w-4 h-4 text-white/40" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => searchUsers(e.target.value)}
              placeholder="Найти пользователя..."
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/40"
            />
            <button onClick={() => setPendingPos(null)}>
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => selectUser(u)}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/10 transition-colors text-left"
                >
                  {u.avatar_url ? (
                    <img loading="lazy" src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-white/40" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-white font-medium">{u.display_name}</p>
                    <p className="text-xs text-white/50">@{u.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {searching && (
            <p className="text-xs text-white/40 text-center py-2">Поиск...</p>
          )}
        </div>
      )}
    </div>
  );
}
