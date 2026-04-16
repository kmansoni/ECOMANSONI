import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, User, Hash, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dbLoose } from "@/lib/supabase";

interface Suggestion {
  type: "user" | "hashtag" | "location";
  id: string;
  label: string;
  sublabel?: string;
  avatar?: string;
}

interface SearchSuggestionsProps {
  query: string;
  visible: boolean;
  onSelect: (suggestion: Suggestion) => void;
}

export function SearchSuggestions({ query, visible, onSelect }: SearchSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const q = query.trim().toLowerCase();
        const results: Suggestion[] = [];

        // Search users
        const { data: users } = await dbLoose
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
          .limit(3);
        if (users) {
          for (const u of users as Array<Record<string, string | null>>) {
            results.push({
              type: "user",
              id: u.id ?? "",
              label: u.username ?? "",
              sublabel: u.full_name ?? "",
              avatar: u.avatar_url ?? undefined,
            });
          }
        }

        // Search hashtags (from posts)
        const { data: posts } = await dbLoose
          .from("posts")
          .select("id, hashtags")
          .not("hashtags", "is", null)
          .limit(50);
        if (posts) {
          const tagSet = new Set<string>();
          for (const p of posts) {
            if (Array.isArray(p.hashtags)) {
              for (const tag of p.hashtags) {
                if (String(tag).toLowerCase().includes(q)) tagSet.add(String(tag));
              }
            }
          }
          Array.from(tagSet)
            .slice(0, 2)
            .forEach(tag => {
              results.push({ type: "hashtag", id: tag, label: `#${tag}` });
            });
        }

        // Search locations
        const { data: locations } = await dbLoose
          .from("locations")
          .select("id, name, address")
          .ilike("name", `%${q}%`)
          .limit(2);
        if (locations) {
          for (const loc of locations as Array<Record<string, string | null>>) {
            results.push({
              type: "location",
              id: loc.id ?? "",
              label: loc.name ?? "",
              sublabel: loc.address ?? "",
            });
          }
        }

        setSuggestions(results.slice(0, 5));
      } finally {
        setLoading(false);
      }
    }, 250);
  }, [query]);

  if (!visible || !query.trim()) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden z-20 shadow-2xl"
      >
        {loading && suggestions.length === 0 && (
          <div className="px-4 py-3 text-zinc-500 text-sm">Поиск...</div>
        )}
        {!loading && suggestions.length === 0 && query.length >= 2 && (
          <div className="px-4 py-3 text-zinc-500 text-sm">Ничего не найдено</div>
        )}
        {suggestions.map((s, i) => (
          <button
            key={`${s.type}-${s.id}`}
            onClick={() => onSelect(s)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-left"
          >
            {s.type === "user" ? (
              s.avatar ? (
                <img loading="lazy" src={s.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-zinc-400" />
                </div>
              )
            ) : s.type === "hashtag" ? (
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                <Hash className="w-4 h-4 text-blue-400" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-pink-400" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{s.label}</p>
              {s.sublabel && <p className="text-zinc-400 text-xs truncate">{s.sublabel}</p>}
            </div>
          </button>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
