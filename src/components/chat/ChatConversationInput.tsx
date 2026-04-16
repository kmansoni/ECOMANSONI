import type { RefObject } from "react";
import { ChatInputBar } from "./ChatInputBar";
import { StickerGifPicker } from "./StickerGifPicker";
import { TextSelectionMenu } from "./TextSelectionMenu";
import { ReplyKeyboard, type ReplyKeyboardButton } from "./ReplyKeyboard";
import { toast } from "sonner";
import type { MentionUser } from "@/hooks/useMentions";
import type { MessageEffectType } from "./MessageEffectOverlay";

interface ChatConversationInputProps {
  conversationId: string;
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
  inputRef: RefObject<HTMLTextAreaElement>;
  replyKeyboard: ReplyKeyboardButton[][] | null;

  setInputText: React.Dispatch<React.SetStateAction<string>>;
  setShowEmojiPicker: (v: boolean) => void;
  setQuotedText: (v: string | null) => void;
  setReplyTo: (v: { id: string; preview: string } | null) => void;

  onInputChange: (value: string, caretPos?: number) => void;
  onSend: (silent?: boolean, overrideText?: string) => void;
  onCancelRecording: () => void;
  onStopRecording: () => void;
  onRecordButtonDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onRecordButtonUp: (e?: React.PointerEvent<HTMLButtonElement>) => void;
  onRecordButtonLeave: () => void;
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
  onEffect: (effect: MessageEffectType) => void;
  onToggleRecordMode: () => void;

  handleStickerSend: (url: string) => void;
  handleGifSend: (url: string) => void;
}

export function ChatConversationInput({
  inputText, isSending, isRecording, recordingTime, recordMode,
  showEmojiPicker, defaultTimer, isSilentSend, showSendOptions,
  isGroup, maxLength, editingMessage, replyTo, quotedText,
  inlineBotTrigger, mentionTrigger, mentionSuggestions, mentionActiveIndex,
  inputRef, replyKeyboard,
  setInputText, setShowEmojiPicker, setQuotedText, setReplyTo,
  onInputChange, onSend, onCancelRecording, onStopRecording,
  onRecordButtonDown, onRecordButtonUp, onRecordButtonLeave,
  onSetShowTimerPicker, onSetShowAttachmentSheet, onSetShowGiftCatalog,
  onSetShowCreatePoll, onSetShowSendOptions, onSetPendingScheduleContent,
  onSetShowSchedulePicker, onCancelEdit, onCancelReply, onScrollToReply,
  onMentionSelect, onMentionActiveIndexChange, onMentionDismiss,
  onInlineBotSelect, onInlineBotDismiss, onEffect, onToggleRecordMode,
  handleStickerSend, handleGifSend,
}: ChatConversationInputProps) {
  return (
    <>
      <TextSelectionMenu
        onReplyWithQuote={(text) => {
          setQuotedText(text);
          setReplyTo({ id: "", preview: text.slice(0, 80) });
        }}
        onCopy={(text) => {
          navigator.clipboard.writeText(text)
            .then(() => toast.success("Скопировано"))
            .catch(() => toast.error("Не удалось скопировать"));
        }}
      />

      {replyKeyboard && (
        <ReplyKeyboard
          keyboard={replyKeyboard}
          onButtonPress={(text) => { void onSend(false, text); }}
          resizable
        />
      )}

      <div className="flex-shrink-0 relative z-10">
        <ChatInputBar
          inputText={inputText}
          isSending={isSending}
          isRecording={isRecording}
          recordingTime={recordingTime}
          recordMode={recordMode}
          showEmojiPicker={showEmojiPicker}
          defaultTimer={defaultTimer}
          isSilentSend={isSilentSend}
          showSendOptions={showSendOptions}
          isGroup={isGroup}
          maxLength={maxLength}
          editingMessage={editingMessage}
          replyTo={replyTo}
          quotedText={quotedText}
          inlineBotTrigger={inlineBotTrigger}
          mentionTrigger={mentionTrigger}
          mentionSuggestions={mentionSuggestions}
          mentionActiveIndex={mentionActiveIndex}
          inputRef={inputRef}
          onInputChange={onInputChange}
          onSend={(silent, overrideText) => void onSend(silent, overrideText)}
          onCancelRecording={onCancelRecording}
          onStopRecording={onStopRecording}
          onRecordButtonDown={onRecordButtonDown}
          onRecordButtonUp={onRecordButtonUp}
          onRecordButtonLeave={onRecordButtonLeave}
          onSetShowEmojiPicker={setShowEmojiPicker}
          onSetShowTimerPicker={onSetShowTimerPicker}
          onSetShowAttachmentSheet={onSetShowAttachmentSheet}
          onSetShowGiftCatalog={onSetShowGiftCatalog}
          onSetShowCreatePoll={onSetShowCreatePoll}
          onSetShowSendOptions={onSetShowSendOptions}
          onSetPendingScheduleContent={onSetPendingScheduleContent}
          onSetShowSchedulePicker={onSetShowSchedulePicker}
          onCancelEdit={onCancelEdit}
          onCancelReply={onCancelReply}
          onScrollToReply={onScrollToReply}
          onMentionSelect={onMentionSelect}
          onMentionActiveIndexChange={onMentionActiveIndexChange}
          onMentionDismiss={onMentionDismiss}
          onInlineBotSelect={onInlineBotSelect}
          onInlineBotDismiss={onInlineBotDismiss}
          onEffect={onEffect}
          onToggleRecordMode={onToggleRecordMode}
        />

        <div onClick={(e) => e.stopPropagation()}>
          <StickerGifPicker
            open={showEmojiPicker}
            onOpenChange={setShowEmojiPicker}
            onEmojiSelect={(emoji) => setInputText((prev) => prev + emoji)}
            onStickerSelect={(sticker) => { setShowEmojiPicker(false); handleStickerSend(sticker.file_url); }}
            onGifSelect={(gif) => { setShowEmojiPicker(false); handleGifSend(gif.url); }}
          />
        </div>
      </div>

      {!showEmojiPicker && <div className="safe-area-bottom" />}
    </>
  );
}
