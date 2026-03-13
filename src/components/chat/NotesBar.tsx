import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createNote, deleteNote, getNotes, sendNoteReaction, deleteNoteReaction, getNoteReactions } from "@/hooks/useNotes";
import type { StatusNote } from "@/hooks/useNotes";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

// Quick-reaction emoji set (Instagram-style)
const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👏", "🔥", "💯"];

interface NotesBarProps {
  chatUserIds: string[];
}

export function NotesBar({ chatUserIds }: NotesBarProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<StatusNote[]>([]);
  const [myNote, setMyNote] = useState<StatusNote | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteEmoji, setNoteEmoji] = useState("");
  // Emoji picker: which note owner's picker is open
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  // Map: noteOwnerId → emoji sent by current user
  const [myReactions, setMyReactions] = useState<Record<string, string>>({});
  const chatUserIdsKey = useMemo(() => chatUserIds.join(","), [chatUserIds]);

  useEffect(() => {
    if (!user || !chatUserIds.length) return;
    const allIds = [user.id, ...chatUserIds];
    getNotes(allIds).then(async (data) => {
      const mine = data.find(n => n.user_id === user.id);
      setMyNote(mine ?? null);
      const others = data.filter(n => n.user_id !== user.id);
      setNotes(others);
      // Fetch existing reactions from current user
      const ownerIds = others.map(n => n.user_id);
      if (ownerIds.length) {
        const reactions = await getNoteReactions(user.id, ownerIds);
        setMyReactions(reactions);
      }
    });
  }, [user, chatUserIds, chatUserIdsKey]);

  const handleReaction = useCallback(async (noteOwnerId: string, emoji: string) => {
    if (!user) return;
    setReactionPickerFor(null);
    const prev = myReactions[noteOwnerId];
    // Toggle: same emoji → remove, different → replace
    if (prev === emoji) {
      setMyReactions(r => { const next = { ...r }; delete next[noteOwnerId]; return next; });
      try { await deleteNoteReaction(user.id, noteOwnerId); }
      catch (error) {
        logger.warn("notes-bar: failed to delete note reaction", {
          noteOwnerId,
          emoji,
          error,
        });
        setMyReactions(r => ({ ...r, [noteOwnerId]: prev }));
        toast.error("Ошибка");
      }
    } else {
      setMyReactions(r => ({ ...r, [noteOwnerId]: emoji }));
      try { await sendNoteReaction(user.id, noteOwnerId, emoji); }
      catch (error) {
        logger.warn("notes-bar: failed to send note reaction", {
          noteOwnerId,
          emoji,
          error,
        });
        setMyReactions(r => {
          const next = { ...r };
          if (prev) next[noteOwnerId] = prev;
          else delete next[noteOwnerId];
          return next;
        });
        toast.error("Ошибка");
      }
    }
  }, [user, myReactions]);

  const handleCreate = async () => {
    if (!user || !noteText.trim()) return;
    try {
      await createNote(user.id, noteText.trim(), noteEmoji || undefined);
      const newNote: StatusNote = {
        user_id: user.id,
        text: noteText.trim(),
        emoji: noteEmoji || undefined,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date().toISOString(),
      };
      setMyNote(newNote);
      setNoteText("");
      setNoteEmoji("");
      setShowCreate(false);
      toast.success("Заметка создана на 24 часа");
    } catch (error) {
      logger.error("notes-bar: failed to create note", { error });
      toast.error("Не удалось создать заметку");
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    try {
      await deleteNote(user.id);
      setMyNote(null);
      toast.success("Заметка удалена");
    } catch (error) {
      logger.error("notes-bar: failed to delete note", { error });
      toast.error("Ошибка");
    }
  };

  const allNotes = myNote ? [myNote, ...notes] : notes;
  if (!allNotes.length && !showCreate) return null;

  return (
    <div className="border-b border-zinc-800">
      <div className="flex items-center gap-3 px-4 py-3 overflow-x-auto scrollbar-hide">
        {/* My note */}
        {!myNote && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex flex-col items-center gap-1 min-w-[60px]"
          >
            <div className="w-12 h-12 rounded-full border-2 border-dashed border-zinc-600 flex items-center justify-center">
              <Plus className="w-5 h-5 text-zinc-400" />
            </div>
            <span className="text-zinc-500 text-[10px] text-center leading-tight">Добавить заметку</span>
          </button>
        )}

        {allNotes.map(note => {
          const isOwn = note.user_id === user?.id;
          const myReaction = myReactions[note.user_id];
          const isPickerOpen = reactionPickerFor === note.user_id;

          return (
            <div key={note.user_id} className="relative flex flex-col items-center gap-1 min-w-[60px]">
              <div className="relative">
                {/* Avatar — tappable for others to open reaction picker */}
                <button
                  className="block"
                  onClick={() => {
                    if (isOwn) return;
                    setReactionPickerFor(isPickerOpen ? null : note.user_id);
                  }}
                  aria-label={isOwn ? undefined : `Реакция на заметку @${note.profile?.username}`}
                  disabled={isOwn}
                >
                  {note.profile?.avatar_url ? (
                    <img src={note.profile.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center text-white text-lg font-semibold">
                      {note.profile?.username?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </button>

                {/* Note bubble */}
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-1 whitespace-nowrap max-w-[120px] overflow-hidden">
                  <p className="text-white text-[10px] truncate">
                    {note.emoji} {note.text}
                  </p>
                </div>

                {/* My reaction badge — shown on avatar bottom-right */}
                {myReaction && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-zinc-900 border border-zinc-700 rounded-full flex items-center justify-center text-[11px] leading-none">
                    {myReaction}
                  </div>
                )}

                {/* Emoji reaction picker */}
                <AnimatePresence>
                  {isPickerOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8, y: 4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-14 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 border border-zinc-700 rounded-2xl px-2 py-1.5 flex gap-1 shadow-xl"
                    >
                      {QUICK_REACTIONS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(note.user_id, emoji)}
                          className={`text-xl w-8 h-8 flex items-center justify-center rounded-full transition-transform active:scale-90 hover:scale-110 ${myReaction === emoji ? "bg-zinc-600" : ""}`}
                          aria-label={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {isOwn && (
                <button onClick={handleDelete} className="absolute -top-1 -right-1 w-4 h-4 bg-zinc-700 rounded-full flex items-center justify-center">
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
              )}
              <span className="text-zinc-500 text-[10px] truncate w-full text-center">
                {isOwn ? "Вы" : note.profile?.username ?? "..."}
              </span>
            </div>
          );
        })}
      </div>

      {/* Create note panel */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-zinc-800"
          >
            <div className="px-4 py-3 bg-zinc-900 flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  value={noteEmoji}
                  onChange={e => setNoteEmoji(e.target.value.slice(0, 2))}
                  placeholder="😊"
                  className="w-12 bg-zinc-800 rounded-xl px-2 py-2 text-center text-lg outline-none"
                />
                <input
                  autoFocus
                  value={noteText}
                  onChange={e => setNoteText(e.target.value.slice(0, 60))}
                  placeholder="Что у вас нового? (до 60 символов)"
                  className="flex-1 bg-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  maxLength={60}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={!noteText.trim()} className="flex-1 py-2 bg-blue-600 rounded-xl text-sm font-semibold text-white disabled:opacity-50">
                  Поделиться
                </button>
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-zinc-800 rounded-xl text-sm text-zinc-400">
                  Отмена
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
