import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSearch, SearchUser } from "@/hooks/useSearch";
import glassBackground from "@/assets/glass-background.png";

interface ChatSearchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartChat: (user: SearchUser) => void;
  existingUserIds: Set<string>;
  currentUserId?: string;
}

export function ChatSearchSheet({ 
  open, 
  onOpenChange, 
  onStartChat,
  existingUserIds,
  currentUserId 
}: ChatSearchSheetProps) {
  const navigate = useNavigate();
  const { users: searchedUsers, loading, searchUsers } = useSearch();
  const [searchQuery, setSearchQuery] = useState("");

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        searchUsers(searchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchUsers]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  // Filter out users already in conversations
  const newUsers = searchedUsers.filter(
    u => !existingUserIds.has(u.user_id) && u.user_id !== currentUserId
  );

  const handleOpenProfile = (user: SearchUser) => {
    // In Telegram Mini App, navigation must be triggered directly from the tap handler.
    navigate(`/user/${user.user_id}`);
    onOpenChange(false);
  };

  const handleStartChat = (user: SearchUser) => {
    onStartChat(user);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="top" 
        className="h-[85vh] rounded-b-3xl border-b border-white/10 shadow-2xl overflow-hidden p-0 bg-transparent"
        overlayClassName="bg-transparent"
        aria-describedby={undefined}
      >
        {/* Semi-transparent glass effect - shows content behind */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-xl pointer-events-none" />
        
        {/* Content */}
        <div className="relative z-10 h-full flex flex-col p-6 pt-12">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-white">Поиск пользователей</SheetTitle>
          </SheetHeader>
          
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
            <Input
              placeholder="Введите имя..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/30"
              autoFocus
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
              </div>
            )}

            {!loading && searchQuery.trim().length < 2 && (
              <div className="text-center py-8 text-white/60 text-sm">
                Введите минимум 2 символа для поиска
              </div>
            )}

            {!loading && searchQuery.trim().length >= 2 && newUsers.length === 0 && (
              <div className="text-center py-8 text-white/60 text-sm">
                Пользователи не найдены
              </div>
            )}

            {newUsers.map((u) => (
              <div
                key={u.user_id}
                onClick={() => handleOpenProfile(u)}
                className="flex items-center gap-3 py-3 hover:bg-white/10 transition-colors cursor-pointer rounded-lg px-2 -mx-2"
              >
                <img
                  src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.user_id}`}
                  alt={u.display_name}
                  className="w-12 h-12 rounded-full object-cover bg-white/10"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-white truncate">
                      {u.display_name}
                    </span>
                    {u.verified && (
                      <span className="text-primary text-xs">✓</span>
                    )}
                  </div>
                  {u.bio && (
                    <p className="text-sm text-white/60 truncate">{u.bio}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="p-2 -m-2 rounded-full hover:bg-white/10 active:bg-white/15 text-primary flex-shrink-0"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleStartChat(u);
                  }}
                  aria-label="Начать чат"
                >
                  <UserPlus className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
