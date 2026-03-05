/**
 * MentionSuggestions — popup list of users matching a @mention query.
 *
 * Positioning: rendered above the textarea (bottom-anchored).
 * Keyboard nav: ArrowUp/Down + Enter works to select.
 * Max 5 items shown (enforced upstream in getMentionSuggestions).
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { type MentionUser } from "@/hooks/useMentions";

interface MentionSuggestionsProps {
  suggestions: MentionUser[];
  visible: boolean;
  onSelect: (user: MentionUser) => void;
  /** Controlled from parent keyboard handler */
  externalActiveIndex?: number;
}

export function MentionSuggestions({
  suggestions,
  visible,
  onSelect,
  externalActiveIndex,
}: MentionSuggestionsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync external keyboard nav
  useEffect(() => {
    if (typeof externalActiveIndex === "number") {
      setActiveIndex(externalActiveIndex);
    }
  }, [externalActiveIndex]);

  // Reset highlight when suggestion list changes
  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!visible || suggestions.length === 0) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="mention-popup"
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-2xl overflow-hidden backdrop-blur-2xl border border-white/10"
          style={{
            background:
              "linear-gradient(145deg, rgba(0,20,40,0.92) 0%, rgba(0,10,30,0.95) 100%)",
            boxShadow:
              "0 -4px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
          role="listbox"
          aria-label="Упоминания пользователей"
        >
          <div ref={listRef} className="py-1.5">
            {suggestions.map((user, i) => {
              const name = user.display_name ?? user.username ?? "Пользователь";
              const sub = user.username ? `@${user.username}` : null;
              return (
                <button
                  key={user.user_id}
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${
                    i === activeIndex
                      ? "bg-white/10"
                      : "hover:bg-white/5"
                  }`}
                  onMouseDown={(e) => {
                    // Prevent input blur before selection
                    e.preventDefault();
                    onSelect(user);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <GradientAvatar
                    name={name}
                    seed={user.user_id}
                    avatarUrl={user.avatar_url}
                    size="sm"
                    className="w-8 h-8 shrink-0 text-xs"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[14px] font-medium text-white truncate">
                      {name}
                    </span>
                    {sub && (
                      <span className="text-[12px] text-white/50 truncate">
                        {sub}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
