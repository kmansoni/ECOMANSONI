import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";

interface StoryMentionProps {
  userId?: string;
  username: string;
  avatarUrl?: string;
  interactive?: boolean;
}

export function StoryMention({ userId, username, avatarUrl, interactive = true }: StoryMentionProps) {
  const navigate = useNavigate();

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={() => interactive && userId && navigate(`/user/${userId}`)}
      className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm text-black rounded-2xl px-3 py-1.5 shadow-lg"
    >
      {avatarUrl && (
        <img src={avatarUrl} alt={username} className="w-5 h-5 rounded-full object-cover" />
      )}
      <span className="text-sm font-semibold">@{username}</span>
    </motion.button>
  );
}

// Picker component for searching users
interface StoryMentionPickerProps {
  onSelect: (user: { id: string; username: string; avatar_url: string }) => void;
  onClose: () => void;
}

export function StoryMentionPicker({ onSelect, onClose }: StoryMentionPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);

  const search = async (q: string) => {
    setQuery(q);
    if (!q) { setResults([]); return; }
    const { data } = await (supabase as any)
      .from("profiles")
      .select("id, username, avatar_url")
      .ilike("username", `%${q}%`)
      .limit(10);
    setResults(data || []);
  };

  return (
    <div className="absolute inset-x-0 bottom-0 bg-zinc-900 rounded-t-2xl p-4 z-50">
      <input
        autoFocus
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Поиск пользователей..."
        className="w-full bg-zinc-800 text-white rounded-xl px-3 py-2 text-sm outline-none mb-3"
      />
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {results.map((u) => (
          <button
            key={u.id}
            onClick={() => { onSelect(u); onClose(); }}
            className="flex items-center gap-2 w-full hover:bg-zinc-800 rounded-lg px-2 py-1.5"
          >
            <img
              src={u.avatar_url || `https://i.pravatar.cc/40?u=${u.id}`}
              alt={u.username}
              className="w-8 h-8 rounded-full"
            />
            <span className="text-white text-sm">@{u.username}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
