import { useRef, useMemo } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Mic, Send, Smile, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AutoGrowTextarea } from "@/components/chat/AutoGrowTextarea";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { AttachmentIcon } from "@/components/chat/AttachmentIcon";
import { AttachmentSheet } from "@/components/chat/AttachmentSheet";
import { CameraCaptureSheet } from "@/components/chat/CameraCaptureSheet";
import { EmojiStickerPicker } from "@/components/chat/EmojiStickerPicker";
import { ImageViewer } from "@/components/chat/ImageViewer";
import { VideoCircleRecorder } from "@/components/chat/VideoCircleRecorder";
import { MentionSuggestions } from "@/components/chat/MentionSuggestions";
import { SendOptionsMenu } from "@/components/chat/SendOptionsMenu";
import {
  detectMentionTrigger,
  insertMention,
  type MentionUser,
} from "@/hooks/useMentions";

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

interface ChannelInputBarProps {
  channelId: string;
  // Draft
  draftPost: string;
  setDraftPost: React.Dispatch<React.SetStateAction<string>>;
  // Editing
  editingChannelMsg: { id: string; content: string } | null;
  setEditingChannelMsg: (v: { id: string; content: string } | null) => void;
  // Role / permissions
  role: string;
  canCreatePosts: boolean;
  sendingPost: boolean;
  // Publish
  handlePublishPost: () => Promise<void>;
  handleAttachment: (file: File, type?: string) => Promise<void>;
  // Notify
  notifySubscribers: boolean;
  setNotifySubscribers: React.Dispatch<React.SetStateAction<boolean>>;
  // Record
  recordMode: "voice" | "video";
  isRecording: boolean;
  recordingTime: number;
  handleRecordButtonDown: (e: React.TouchEvent | React.MouseEvent) => void;
  handleRecordButtonUp: () => void;
  handleRecordButtonLeave: () => void;
  handleVideoRecord: (videoBlob: Blob, duration: number) => void;
  cancelVoiceRecording: () => void;
  stopVoiceRecordingAndSend: () => Promise<void>;
  // Stickers
  sendSticker: (sticker: string) => Promise<void>;
  // Mentions
  mentionSuggestions: MentionUser[];
  mentionTrigger: { triggerStart: number; query: string } | null;
  mentionActiveIndex: number;
  setMentionTrigger: (v: { triggerStart: number; query: string } | null) => void;
  setMentionActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  // Sheet/picker state
  showAttachmentSheet: boolean;
  setShowAttachmentSheet: (v: boolean) => void;
  showCameraSheet: boolean;
  setShowCameraSheet: (v: boolean) => void;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (v: boolean) => void;
  showStickerPicker: boolean;
  setShowStickerPicker: (v: boolean) => void;
  showSendOptions: boolean;
  setShowSendOptions: (v: boolean) => void;
  showVideoRecorder: boolean;
  setShowVideoRecorder: (v: boolean) => void;
  viewingImage: string | null;
  setViewingImage: (v: string | null) => void;
}

const QUICK_STICKERS = ["😄", "😍", "😂", "🔥", "👍", "❤️", "🥳", "😮", "😢", "😡", "🤝", "🙏", "💯", "✨", "🎉", "🤩", "🫶", "😴", "🤯", "😎"];

export function ChannelInputBar(props: ChannelInputBarProps) {
  const {
    channelId,
    draftPost,
    setDraftPost,
    editingChannelMsg,
    setEditingChannelMsg,
    role,
    canCreatePosts,
    sendingPost,
    handlePublishPost,
    handleAttachment,
    notifySubscribers,
    setNotifySubscribers,
    recordMode,
    isRecording,
    recordingTime,
    handleRecordButtonDown,
    handleRecordButtonUp,
    handleRecordButtonLeave,
    handleVideoRecord,
    cancelVoiceRecording,
    stopVoiceRecordingAndSend,
    sendSticker,
    mentionSuggestions,
    mentionTrigger,
    mentionActiveIndex,
    setMentionTrigger,
    setMentionActiveIndex,
    showAttachmentSheet,
    setShowAttachmentSheet,
    showCameraSheet,
    setShowCameraSheet,
    showEmojiPicker,
    setShowEmojiPicker,
    showStickerPicker,
    setShowStickerPicker,
    showSendOptions,
    setShowSendOptions,
    showVideoRecorder,
    setShowVideoRecorder,
    viewingImage,
    setViewingImage,
  } = props;

  const channelInputRef = useRef<HTMLTextAreaElement>(null);
  const sendButtonLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div className="flex-shrink-0 px-3 py-3 relative z-10 bg-background/95 backdrop-blur-sm border-t border-border safe-area-bottom">
      {editingChannelMsg && (
        <div className="mb-2 rounded-2xl bg-blue-900/40 border border-blue-500/30 px-3 py-2 flex items-start justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <X className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-blue-300">Редактирование</p>
              <p className="text-sm text-foreground/80 truncate">{editingChannelMsg.content}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setEditingChannelMsg(null); setDraftPost(""); }}
            className="shrink-0 p-1 rounded-md hover:bg-white/10"
            aria-label="Отменить редактирование"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
        <span>Роль: {role}</span>
        {!canCreatePosts && <span>• публикация отключена</span>}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAttachmentSheet(true)}
          disabled={!canCreatePosts || sendingPost}
          className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label="Вложение"
        >
          <AttachmentIcon className="w-5 h-5" />
        </button>

        <div className="flex-1 relative">
          <MentionSuggestions
            suggestions={mentionSuggestions}
            visible={mentionTrigger !== null && mentionSuggestions.length > 0}
            onSelect={(user) => {
              if (!mentionTrigger) return;
              const caret = channelInputRef.current?.selectionStart ?? draftPost.length;
              const { newText, newCaretPos } = insertMention(draftPost, caret, mentionTrigger.triggerStart, user.username ?? user.display_name ?? user.user_id);
              setDraftPost(newText);
              setMentionTrigger(null);
              requestAnimationFrame(() => {
                if (channelInputRef.current) {
                  channelInputRef.current.focus();
                  channelInputRef.current.setSelectionRange(newCaretPos, newCaretPos);
                }
              });
            }}
            externalActiveIndex={mentionActiveIndex}
          />
          <AutoGrowTextarea
            ref={channelInputRef}
            value={draftPost}
            onChange={(e) => {
              const val = e.target.value;
              setDraftPost(val);
              const caret = (e.target as HTMLTextAreaElement).selectionStart ?? val.length;
              const trigger = detectMentionTrigger(val, caret);
              setMentionTrigger(trigger);
              setMentionActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (mentionTrigger && mentionSuggestions.length > 0) {
                if (e.key === "ArrowDown") { e.preventDefault(); setMentionActiveIndex(i => Math.min(i + 1, mentionSuggestions.length - 1)); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setMentionActiveIndex(i => Math.max(i - 1, 0)); return; }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  const sel = mentionSuggestions[mentionActiveIndex];
                  if (sel) {
                    const caret = channelInputRef.current?.selectionStart ?? draftPost.length;
                    const { newText, newCaretPos } = insertMention(draftPost, caret, mentionTrigger.triggerStart, sel.username ?? sel.display_name ?? sel.user_id);
                    setDraftPost(newText);
                    setMentionTrigger(null);
                    requestAnimationFrame(() => { if (channelInputRef.current) { channelInputRef.current.focus(); channelInputRef.current.setSelectionRange(newCaretPos, newCaretPos); } });
                  }
                  return;
                }
                if (e.key === "Escape") { setMentionTrigger(null); return; }
              }
            }}
            onSend={() => {
              if (!sendingPost) void handlePublishPost();
            }}
            onFocus={() => setShowEmojiPicker(false)}
            placeholder={canCreatePosts ? "Сообщение" : "Для публикации нужны права"}
            disabled={!canCreatePosts || sendingPost}
            className="flex-1 rounded-2xl pr-20 bg-black/40"
          />

          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNotifySubscribers((v) => !v)}
              disabled={!canCreatePosts || sendingPost}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label={notifySubscribers ? "Публикация с уведомлением" : "Публикация без уведомления"}
              title={notifySubscribers ? "С уведомлением" : "Без уведомления"}
            >
              {notifySubscribers ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={!canCreatePosts || sendingPost}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label="Эмодзи"
            >
              <Smile className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setShowStickerPicker(true)}
              disabled={!canCreatePosts || sendingPost}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label="Стикеры"
            >
              <span className="text-[15px]">🧩</span>
            </button>
          </div>
        </div>
        {draftPost.trim() ? (
          <div className="relative shrink-0">
            <SendOptionsMenu
              open={showSendOptions}
              onClose={() => setShowSendOptions(false)}
              onSend={() => void handlePublishPost()}
              onSilent={() => { setNotifySubscribers(false); void handlePublishPost(); }}
              onSchedule={() => { toast.info("Планирование постов скоро"); }}
            />
            <Button
              onMouseDown={(e) => {
                e.preventDefault();
                sendButtonLongPressRef.current = setTimeout(() => {
                  sendButtonLongPressRef.current = null;
                  setShowSendOptions(true);
                }, 500) as unknown as ReturnType<typeof setTimeout>;
              }}
              onMouseUp={() => {
                if (sendButtonLongPressRef.current) {
                  clearTimeout(sendButtonLongPressRef.current);
                  sendButtonLongPressRef.current = null;
                  void handlePublishPost();
                }
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                sendButtonLongPressRef.current = setTimeout(() => {
                  sendButtonLongPressRef.current = null;
                  setShowSendOptions(true);
                }, 500) as unknown as ReturnType<typeof setTimeout>;
              }}
              onTouchEnd={() => {
                if (sendButtonLongPressRef.current) {
                  clearTimeout(sendButtonLongPressRef.current);
                  sendButtonLongPressRef.current = null;
                  void handlePublishPost();
                }
              }}
              disabled={!canCreatePosts || sendingPost || !draftPost.trim()}
              size="icon"
              className="w-11 h-11 rounded-full"
              aria-label="Опубликовать"
              type="button"
            >
              <Send className="w-5 h-5 text-primary-foreground" />
            </Button>
          </div>
        ) : (
          <button
            onTouchStart={handleRecordButtonDown}
            onTouchEnd={handleRecordButtonUp}
            onMouseDown={handleRecordButtonDown}
            onMouseUp={handleRecordButtonUp}
            onMouseLeave={handleRecordButtonLeave}
            onContextMenu={(e) => e.preventDefault()}
            disabled={!canCreatePosts || sendingPost}
            className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center border border-border bg-card disabled:opacity-50"
            aria-label={recordMode === "voice" ? "Голосовое (удерживайте)" : "Видео-кружок (удерживайте)"}
            title={recordMode === "voice" ? "Тап: видео • Удержание: запись" : "Тап: голос • Удержание: запись"}
            type="button"
          >
            {recordMode === "voice" ? <Mic className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>
        )}
      </div>

      {isRecording ? (
        <div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Запись… {formatDuration(recordingTime)}</div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={cancelVoiceRecording}>
              Отмена
            </Button>
            <Button size="sm" onClick={() => void stopVoiceRecordingAndSend()}>
              Отправить
            </Button>
          </div>
        </div>
      ) : null}

      <EmojiStickerPicker
        open={showEmojiPicker}
        onOpenChange={setShowEmojiPicker}
        onEmojiSelect={(emoji) => setDraftPost((prev) => prev + emoji)}
      />

      <Drawer open={showStickerPicker} onOpenChange={setShowStickerPicker}>
        <DrawerContent className="mx-4 mb-4 rounded-2xl border-0 bg-card">
          <div className="px-4 py-3 text-sm font-medium">Стикеры</div>
          <div className="px-4 pb-4 grid grid-cols-5 gap-2">
            {QUICK_STICKERS.map((s) => (
              <button
                key={s}
                type="button"
                className="h-12 rounded-xl border border-border bg-background/50 text-[26px] flex items-center justify-center"
                onClick={() => void sendSticker(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      <AttachmentSheet
        open={showAttachmentSheet}
        onOpenChange={setShowAttachmentSheet}
        onSelectFile={handleAttachment}
        onSelectLocation={() => toast.message("Геопозиция пока не поддерживается")}
        onOpenCamera={() => {
          setShowCameraSheet(true);
        }}
      />

      <CameraCaptureSheet
        open={showCameraSheet}
        onOpenChange={setShowCameraSheet}
        settingsScopeKey={`channel:${channelId}`}
        onSendFile={async (file, type) => {
          await handleAttachment(file, type);
        }}
      />

      {viewingImage ? <ImageViewer src={viewingImage} onClose={() => setViewingImage(null)} /> : null}

      {showVideoRecorder ? (
        <VideoCircleRecorder onRecord={handleVideoRecord} onCancel={() => setShowVideoRecorder(false)} />
      ) : null}
    </div>
  );
}
