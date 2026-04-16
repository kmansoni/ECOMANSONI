/**
 * src/components/chat/ChatInputBar.tsx
 *
 * Chat input area: text field, record button, emoji/sticker picker trigger,
 * attachment button, send/schedule options, reply/edit banners.
 * Extracted from ChatConversation.tsx.
 */
import React, { useRef, useCallback } from "react";
import { X, Send, Mic, Video, Smile, Timer, Pencil } from "lucide-react";
import { AttachmentIcon } from "./AttachmentIcon";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { InlineBotResults } from "./InlineBotResults";
import { MentionSuggestions } from "./MentionSuggestions";
import { SendOptionsMenu } from "./SendOptionsMenu";
import { QuickReplyBar } from "./QuickReplyBar";
import type { MessageEffectType } from "./MessageEffectOverlay";
import type { MentionUser } from "@/hooks/useMentions";
import type { QuickReply } from "@/hooks/useQuickReplies";
import { formatTime } from "./chatConversationHelpers";

interface ChatInputBarProps {
  inputText: string;
  isSending: boolean;
  isRecording: boolean;
  recordingTime: number;
  recordMode: "voice" | "video";
  showEmojiPicker: boolean;
  defaultTimer: number | null;
  isSilentSend: boolean;
  showSendOptions: boolean;
  isGroup?: boolean;
  maxLength: number;

  editingMessage: { id: string; content: string } | null;
  replyTo: { id: string; preview: string } | null;
  quotedText: string | null;

  inlineBotTrigger: { botUsername: string; query: string } | null;
  mentionTrigger: { query: string; triggerStart: number } | null;
  mentionSuggestions: MentionUser[];
  mentionActiveIndex: number;

  inputRef: React.Ref<HTMLTextAreaElement>;

  onInputChange: (value: string, caretPos?: number) => void;
  onSend: (silent?: boolean, overrideText?: string) => void;
  onCancelRecording: () => void;
  onStopRecording: () => void;
  onRecordButtonDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onRecordButtonUp: (e?: React.PointerEvent<HTMLButtonElement>) => void;
  onRecordButtonLeave: () => void;
  onSetShowEmojiPicker: (v: boolean) => void;
  onSetShowTimerPicker: (v: boolean) => void;
  onSetShowAttachmentSheet: (v: boolean) => void;
  onSetShowGiftCatalog: (v: boolean) => void;
  onSetShowCreatePoll: (v: boolean) => void;
  onSetShowSendOptions: (v: boolean) => void;
  onSetPendingScheduleContent: (v: string) => void;
  onSetShowSchedulePicker: (v: boolean) => void;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onScrollToReply: (id: string) => void;

  onMentionSelect: (user: MentionUser) => void;
  onMentionActiveIndexChange: (i: number) => void;
  onMentionDismiss: () => void;
  onInlineBotSelect: (result: { sendContent: { text?: string } }) => void;
  onInlineBotDismiss: () => void;
  onEffect?: (effect: MessageEffectType) => void;
  onToggleRecordMode?: () => void;
  quickReplies?: QuickReply[];
  onQuickReplySelect?: (text: string) => void;
}

export function ChatInputBar({
  inputText,
  isSending,
  isRecording,
  recordingTime,
  recordMode,
  showEmojiPicker,
  defaultTimer,
  isSilentSend,
  showSendOptions,
  isGroup,
  maxLength,
  editingMessage,
  replyTo,
  quotedText,
  inlineBotTrigger,
  mentionTrigger,
  mentionSuggestions: mentionSuggestionsArr,
  mentionActiveIndex,
  inputRef,
  onInputChange,
  onSend,
  onCancelRecording,
  onStopRecording,
  onRecordButtonDown,
  onRecordButtonUp,
  onRecordButtonLeave,
  onSetShowEmojiPicker,
  onSetShowTimerPicker,
  onSetShowAttachmentSheet,
  onSetShowGiftCatalog,
  onSetShowCreatePoll,
  onSetShowSendOptions,
  onSetPendingScheduleContent,
  onSetShowSchedulePicker,
  onCancelEdit,
  onCancelReply,
  onScrollToReply,
  onMentionSelect,
  onMentionActiveIndexChange,
  onMentionDismiss,
  onInlineBotSelect,
  onInlineBotDismiss,
  onEffect,
  onToggleRecordMode,
  quickReplies,
  onQuickReplySelect,
}: ChatInputBarProps) {
  const sendButtonLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionTrigger && mentionSuggestionsArr.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onMentionActiveIndexChange(Math.min(mentionActiveIndex + 1, mentionSuggestionsArr.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onMentionActiveIndexChange(Math.max(mentionActiveIndex - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const selected = mentionSuggestionsArr[mentionActiveIndex];
          if (selected) onMentionSelect(selected);
          return;
        }
        if (e.key === "Escape") {
          onMentionDismiss();
          return;
        }
      }
    },
    [mentionTrigger, mentionSuggestionsArr, mentionActiveIndex, onMentionSelect, onMentionActiveIndexChange, onMentionDismiss],
  );

  return (
      <div className="px-3 py-3">
        {/* Edit banner */}
        {editingMessage && (
          <div className="mb-2 rounded-2xl bg-blue-900/40 backdrop-blur-xl border border-blue-500/30 px-3 py-2 flex items-start justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <Pencil className="w-4 h-4 text-blue-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-blue-300">Редактирование</p>
                <p className="text-sm text-white/80 truncate">{editingMessage.content}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancelEdit}
              className="shrink-0 p-1 rounded-md hover:bg-white/10"
              aria-label="Отменить редактирование"
            >
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>
        )}

        {/* Reply banner */}
        {!editingMessage && replyTo && (
          <div className="mb-2 rounded-2xl bg-black/35 backdrop-blur-xl border border-white/10 px-3 py-2 flex items-start justify-between gap-2">
            <button
              className="min-w-0 text-left"
              onClick={() => replyTo.id ? onScrollToReply(replyTo.id) : undefined}
              type="button"
            >
              <p className="text-xs text-white/60">Ответ</p>
              <p className="text-sm text-white/90 truncate">{replyTo.preview}</p>
              {quotedText && (
                <div className="text-xs italic text-white/60 mt-1 border-l-2 border-blue-400 pl-2">
                  {quotedText}
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={onCancelReply}
              className="shrink-0 p-1 rounded-md hover:bg-white/10"
              aria-label="Отменить ответ"
            >
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>
        )}

        {isRecording ? (
          <div className="flex items-center gap-3">
            <button
              onClick={onCancelRecording}
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 backdrop-blur-xl border border-white/10"
              style={{
                background: "linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.3)",
              }}
            >
              <X className="w-5 h-5 text-white/70" />
            </button>

            <div
              className="flex-1 flex items-center gap-3 h-12 px-5 rounded-full backdrop-blur-xl border border-white/10"
              style={{
                background: "linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.3)",
              }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-white/70">
                Запись... {formatTime(recordingTime)}
              </span>
            </div>

            <button
              onClick={onStopRecording}
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, #00A3B4 0%, #0066CC 50%, #00C896 100%)",
                boxShadow: "0 0 20px rgba(0,163,180,0.4), 0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSetShowAttachmentSheet(true)}
              className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center border border-white/20 bg-white/5 text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors"
              aria-label="Вложение"
              type="button"
            >
              <AttachmentIcon className="w-5 h-5" />
            </button>

            <div className="flex-1 relative">
              {/* Inline bot results */}
              {inlineBotTrigger && (
                <InlineBotResults
                  botUsername={inlineBotTrigger.botUsername}
                  query={inlineBotTrigger.query}
                  onSelectResult={(result) => {
                    if (result.sendContent.text) onInlineBotSelect(result);
                    onInlineBotDismiss();
                  }}
                  onDismiss={onInlineBotDismiss}
                />
              )}

              {/* @Mention suggestions */}
              <MentionSuggestions
                suggestions={mentionSuggestionsArr}
                visible={mentionTrigger !== null && mentionSuggestionsArr.length > 0}
                onSelect={onMentionSelect}
                externalActiveIndex={mentionActiveIndex}
              />

              {/* Quick replies — при вводе "/" */}
              {quickReplies && quickReplies.length > 0 && inputText.startsWith("/") && onQuickReplySelect && (
                <QuickReplyBar
                  replies={quickReplies}
                  filterText={inputText.slice(1)}
                  onSelect={onQuickReplySelect}
                />
              )}

              <AutoGrowTextarea
                ref={inputRef}
                placeholder="Сообщение"
                value={inputText}
                maxLength={maxLength}
                onChange={(e) =>
                  onInputChange(e.target.value, (e.target as HTMLTextAreaElement).selectionStart ?? undefined)
                }
                onSend={() => {
                  if (!isSending) onSend();
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => onSetShowEmojiPicker(false)}
                className="w-full px-5 pr-20 rounded-2xl bg-black/40"
              />

              {/* Icons inside input */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button
                  onClick={() => onSetShowTimerPicker(true)}
                  className={`transition-colors ${defaultTimer !== null ? "text-orange-400" : "text-white/50 hover:text-white/70"}`}
                  aria-label="Таймер автоудаления"
                >
                  <Timer className="w-5 h-5" />
                </button>
                <button
                  onClick={() => onSetShowEmojiPicker(!showEmojiPicker)}
                  className={`transition-colors ${showEmojiPicker ? "text-cyan-400" : "text-white/50 hover:text-white/70"}`}
                >
                  <Smile className="w-5 h-5" />
                </button>
                {!isGroup && (
                  <button
                    onClick={() => onSetShowGiftCatalog(true)}
                    className="text-amber-400/70 hover:text-amber-400 transition-colors"
                    aria-label="Отправить подарок"
                  >
                    <span className="text-base leading-none">🎁</span>
                  </button>
                )}
                <button
                  onClick={() => onSetShowCreatePoll(true)}
                  className="text-white/50 hover:text-blue-400 transition-colors"
                  aria-label="Создать опрос"
                >
                  <span className="text-base leading-none">📊</span>
                </button>
              </div>
            </div>

            {/* Right button - send or record */}
            {inputText.trim() ? (
              <div className="relative shrink-0">
                <SendOptionsMenu
                  open={showSendOptions}
                  onClose={() => onSetShowSendOptions(false)}
                  onSend={() => onSend(false)}
                  onSilent={() => onSend(true)}
                  onSchedule={() => {
                    onSetPendingScheduleContent(inputText.trim());
                    onSetShowSchedulePicker(true);
                  }}
                  onEffect={onEffect}
                />
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    sendButtonLongPressRef.current = setTimeout(() => {
                      sendButtonLongPressRef.current = null;
                      onSetShowSendOptions(true);
                    }, 500);
                  }}
                  onMouseUp={() => {
                    if (sendButtonLongPressRef.current) {
                      clearTimeout(sendButtonLongPressRef.current);
                      sendButtonLongPressRef.current = null;
                      onSend(false);
                    }
                  }}
                  onMouseLeave={() => {
                    if (sendButtonLongPressRef.current) {
                      clearTimeout(sendButtonLongPressRef.current);
                      sendButtonLongPressRef.current = null;
                    }
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    sendButtonLongPressRef.current = setTimeout(() => {
                      sendButtonLongPressRef.current = null;
                      onSetShowSendOptions(true);
                    }, 500);
                  }}
                  onTouchEnd={() => {
                    if (sendButtonLongPressRef.current) {
                      clearTimeout(sendButtonLongPressRef.current);
                      sendButtonLongPressRef.current = null;
                      onSend(false);
                    }
                  }}
                  disabled={isSending}
                  className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
                  style={{
                    background: isSilentSend
                      ? "linear-gradient(135deg, #b45309 0%, #92400e 100%)"
                      : "linear-gradient(135deg, #00A3B4 0%, #0066CC 50%, #00C896 100%)",
                    boxShadow: "0 0 25px rgba(0,163,180,0.5), 0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                  }}
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => onToggleRecordMode?.()}
                onPointerDown={onRecordButtonDown}
                onPointerUp={onRecordButtonUp}
                onPointerCancel={onRecordButtonUp}
                onPointerLeave={onRecordButtonLeave}
                onContextMenu={(e) => e.preventDefault()}
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all backdrop-blur-xl border border-cyan-400/30 select-none"
                style={{
                  background:
                    recordMode === "video"
                      ? "linear-gradient(145deg, rgba(139,92,246,0.3) 0%, rgba(0,102,204,0.2) 100%)"
                      : "linear-gradient(145deg, rgba(0,163,180,0.3) 0%, rgba(0,102,204,0.2) 100%)",
                  boxShadow: "0 0 20px rgba(0,163,180,0.3), inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 20px rgba(0,0,0,0.3)",
                }}
              >
                {recordMode === "voice" ? (
                  <Mic className="w-5 h-5 text-cyan-300" />
                ) : (
                  <Video className="w-5 h-5 text-purple-300" />
                )}
              </button>
            )}
          </div>
        )}
      </div>
  );
}
