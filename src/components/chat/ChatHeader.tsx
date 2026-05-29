/**
 * src/components/chat/ChatHeader.tsx
 *
 * Redesigned chat header bar: back button, avatar, name/status, call buttons.
 * Features: Glass morphism, status dot, compact icons, Telegram-style.
 */
import { useNavigate } from "react-router-dom";
import { Phone, Video, Search, Users as UsersIcon } from "lucide-react";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { TypingDots } from "./TypingDots";

interface ChatHeaderProps {
  conversationId: string;
  chatName: string;
  chatAvatar: string | null;
  otherUserId: string;
  isGroup?: boolean;
  totalUnreadCount?: number;
  headerStatusText: string;
  isOtherOnline: boolean;
  isOtherTyping: boolean;
  otherStatusEmoji: string | null;
  otherStatusStickerUrl: string | null;
  onBack: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onStartGroupVideoCall?: () => void;
  onSearchOpen: () => void;
  onAddMembers?: () => void;
}

export function ChatHeader({
  conversationId,
  chatName,
  chatAvatar,
  otherUserId,
  isGroup,
  totalUnreadCount,
  headerStatusText,
  isOtherOnline,
  isOtherTyping,
  otherStatusEmoji,
  otherStatusStickerUrl,
  onBack,
  onStartAudioCall,
  onStartVideoCall,
  onSearchOpen,
  onStartGroupVideoCall,
  onAddMembers,
}: ChatHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex-shrink-0 relative z-10">
      {/* Main header bar */}
      <div className="flex items-center px-3 py-2.5 gap-3">
        {/* Back button - glass pill style */}
        <button
          onClick={onBack}
          aria-label="Назад"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 backdrop-blur-md border border-white/15 hover:bg-white/20 active:bg-white/25 transition-all"
        >
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {totalUnreadCount && totalUnreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-[10px] font-bold text-white flex items-center justify-center shadow-lg">
              {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
            </span>
          ) : null}
        </button>

        {/* Avatar + Name + Status */}
        <button
          onClick={() => {
            if (isGroup) return;
            navigate(`/contact/${otherUserId}`, { state: { name: chatName, avatar: chatAvatar, conversationId } });
          }}
          className={`flex items-center gap-3 flex-1 min-w-0 rounded-2xl px-2 py-1 transition-colors ${
            isGroup ? "cursor-default" : "hover:bg-white/5 active:bg-white/10"
          }`}
        >
          <div className="relative flex-shrink-0">
            <GradientAvatar
              name={chatName}
              seed={conversationId}
              avatarUrl={chatAvatar}
              size="sm"
            />
            {/* Status indicator - online/typing */}
            {!isGroup && (
              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0a1628] ${
                isOtherTyping ? "bg-cyan-400" : isOtherOnline ? "bg-emerald-400" : "bg-white/40"
              }`} />
            )}
            {otherStatusStickerUrl && (
              <img loading="lazy"
                src={otherStatusStickerUrl}
                alt="status sticker"
                className="absolute -bottom-2 -left-2 w-8 h-8 rounded-xl object-cover bg-white/10 border border-white/20 shadow-md"
              />
            )}
          </div>

          <div className="flex flex-col items-start min-w-0">
            <h2 className="font-semibold text-white text-[15px] truncate max-w-[160px] flex items-center gap-1.5">
              {chatName}
              {otherStatusEmoji && (
                <span className="text-base">{otherStatusEmoji}</span>
              )}
            </h2>
            <div className="flex items-center gap-1.5">
              {/* Status text with typing animation */}
              <span className={`text-xs ${
                isGroup
                  ? "text-cyan-300/80"
                  : isOtherTyping
                    ? "text-cyan-300"
                    : isOtherOnline
                      ? "text-emerald-300"
                      : "text-white/50"
              }`}>
                {headerStatusText}
                {isOtherTyping && <TypingDots className="ml-1 inline-block" />}
              </span>
            </div>
          </div>
        </button>

        {/* Quick actions - compact glass buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onSearchOpen}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/15 active:bg-white/20 transition-all border border-white/10"
            aria-label="Поиск сообщений"
          >
            <Search className="w-4 h-4 text-white/80" />
          </button>
          <button
            onClick={onStartAudioCall}
            className="relative w-8 h-8 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/15 active:bg-white/20 transition-all border border-white/10"
            aria-label="Аудиозвонок"
            data-testid="audio-call-btn"
          >
            <Phone className="w-4 h-4 text-cyan-300" />
            {isGroup && <UsersIcon className="w-2.5 h-2.5 text-cyan-300 absolute -bottom-0.5 -right-0.5" />}
          </button>
          <button
            onClick={onStartVideoCall}
            className="relative w-8 h-8 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/15 active:bg-white/20 transition-all border border-white/10"
            aria-label="Видеозвонок"
            data-testid="video-call-btn"
          >
            <Video className="w-4 h-4 text-cyan-300" />
            {isGroup && <UsersIcon className="w-2.5 h-2.5 text-cyan-300 absolute -bottom-0.5 -right-0.5" />}
          </button>
          {isGroup && onStartGroupVideoCall && (
            <button
              onClick={onStartGroupVideoCall}
              className="relative w-8 h-8 rounded-full flex items-center justify-center bg-cyan-500/20 hover:bg-cyan-500/30 transition-all border border-cyan-400/30"
              aria-label="Групповой видеозвонок"
            >
              <Video className="w-4 h-4 text-cyan-300" />
              <div className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center bg-cyan-400 rounded-full">
                <span className="text-[8px] font-bold text-[#0a1628]">+</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Add members bar - only for groups */}
      {isGroup && onAddMembers && (
        <button
          onClick={onAddMembers}
          className="w-full py-2.5 px-4 flex items-center justify-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 active:bg-cyan-500/30 transition-all border-y border-cyan-400/20"
        >
          <span className="text-cyan-300 text-sm font-medium">Добавить участников</span>
          <div className="w-5 h-5 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center">
            <span className="text-cyan-300 text-xs font-bold">+</span>
          </div>
        </button>
      )}
    </div>
  );
}
