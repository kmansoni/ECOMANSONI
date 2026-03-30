/**
 * src/components/chat/ChatHeader.tsx
 *
 * Chat header bar: back button, avatar, name/status, call buttons.
 * Extracted from ChatConversation.tsx.
 */
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Video, Search, Users as UsersIcon } from "lucide-react";
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
  onSearchOpen: () => void;
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
}: ChatHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex-shrink-0 safe-area-top relative z-10 backdrop-blur-xl bg-black/20 border-b border-white/10">
      <div className="flex items-center px-2 py-2">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1 p-2 text-[#6ab3f3] hover:bg-white/5 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          {totalUnreadCount && totalUnreadCount > 0 ? (
            <span className="text-sm font-medium">{totalUnreadCount}</span>
          ) : null}
        </button>

        {/* Avatar + Name + Status */}
        <button
          onClick={() => {
            if (isGroup) return;
            navigate(`/contact/${otherUserId}`, { state: { name: chatName, avatar: chatAvatar, conversationId } });
          }}
          className={`flex items-center gap-3 flex-1 min-w-0 rounded-lg px-2 py-1 transition-colors ${
            isGroup ? "cursor-default" : "hover:bg-white/5"
          }`}
        >
          <div className="relative flex-shrink-0">
            <GradientAvatar
              name={chatName}
              seed={conversationId}
              avatarUrl={chatAvatar}
              size="sm"
            />
            {otherStatusStickerUrl ? (
              <img
                src={otherStatusStickerUrl}
                alt="status sticker"
                className="absolute -bottom-2 -left-2 w-9 h-9 rounded-xl object-cover bg-white/10 border border-white/20"
              />
            ) : null}
          </div>
          <div className="flex flex-col items-start min-w-0">
            <h2 className="font-semibold text-white text-base truncate max-w-[180px]">
              {chatName}{otherStatusEmoji ? ` ${otherStatusEmoji}` : ""}
            </h2>
            <p
              className={`text-xs flex items-center gap-1.5 ${
                isGroup
                  ? "text-[#6ab3f3]"
                  : isOtherTyping
                    ? "text-[#6ab3f3]"
                    : isOtherOnline
                      ? "text-emerald-400"
                      : "text-[#6ab3f3]"
              }`}
            >
              {!isGroup ? (
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    isOtherTyping ? "bg-[#6ab3f3]" : isOtherOnline ? "bg-emerald-400" : "bg-white/40"
                  }`}
                  aria-hidden="true"
                />
              ) : null}
              <span className="truncate">
                {headerStatusText}
                {isOtherTyping && <TypingDots className="ml-1" />}
              </span>
            </p>
          </div>
        </button>

        {/* Right - quick actions */}
        <div className="flex items-center">
          <button
            onClick={onSearchOpen}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Поиск сообщений"
          >
            <Search className="w-4 h-4 text-white/60" />
          </button>
          <button
            onClick={onStartAudioCall}
            className="p-2 rounded-full hover:bg-white/10 active:bg-white/15 transition-colors relative"
            aria-label="Аудиозвонок"
          >
            <Phone className="w-5 h-5 text-[#6ab3f3]" />
            {isGroup && <UsersIcon className="w-3 h-3 text-[#6ab3f3] absolute -bottom-0.5 -right-0.5" />}
          </button>
          <button
            onClick={onStartVideoCall}
            className="p-2 rounded-full hover:bg-white/10 active:bg-white/15 transition-colors relative"
            aria-label="Видеозвонок"
          >
            <Video className="w-5 h-5 text-[#6ab3f3]" />
            {isGroup && <UsersIcon className="w-3 h-3 text-[#6ab3f3] absolute -bottom-0.5 -right-0.5" />}
          </button>
        </div>
      </div>

      {/* Add participants banner for groups */}
      {isGroup && (
        <button className="w-full py-2.5 px-4 bg-white/5 flex items-center justify-center gap-2 border-t border-white/5">
          <span className="text-[#6ab3f3] text-sm font-medium">Добавить участников</span>
          <span className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center">
            <span className="text-white/60 text-xs leading-none">+</span>
          </span>
        </button>
      )}
    </div>
  );
}
