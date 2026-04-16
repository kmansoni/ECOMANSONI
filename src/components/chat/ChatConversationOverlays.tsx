import type { Dispatch, SetStateAction, Ref, ChangeEvent } from "react";
import { useMemo } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VideoCircleRecorder } from "./VideoCircleRecorder";
import { AttachmentSheet } from "./AttachmentSheet";
import { MediaAlbumPreview } from "./MediaAlbumPreview";
import { CameraCaptureSheet } from "./CameraCaptureSheet";
import { ImageViewer } from "./ImageViewer";
import { FullscreenVideoPlayer } from "./VideoPlayer";
import { ForwardMessageSheet } from "./ForwardMessageSheet";
import { ContactShareSheet } from "./ContactShareSheet";
import { GiftCatalog } from "./GiftCatalog";
import { DisappearTimerPicker } from "./DisappearTimerPicker";
import { MessageContextMenu } from "./MessageContextMenu";
import { PinnedMessagesSheet } from "./PinnedMessagesSheet";
import { ScheduledMessagesList } from "./ScheduledMessagesList";
import { ScheduleMessagePicker } from "./ScheduleMessagePicker";
import { MessageSearchSheet } from "./MessageSearchSheet";
import { CreatePollSheet } from "./CreatePollSheet";
import { ChatSettingsSheet } from "./ChatSettingsSheet";
import { JumpToDatePicker } from "./JumpToDatePicker";
import { buildChatBodyEnvelope, sendMessageV1 } from "@/lib/chat/sendMessageV1";
import type { ChatMessage } from "@/hooks/useChat";
import type { PinnedMessage } from "@/hooks/usePinnedMessages";
import type { ScheduledMessage } from "@/hooks/useScheduledMessages";
import type { LocalSearchMessage } from "@/hooks/useMessageSearch";

interface DeleteDialogState {
  open: boolean;
  messageId: string | null;
}

interface ContextMenuState {
  id: string;
  content: string;
  isOwn: boolean;
  position: { top: number; left: number; width: number };
}

export interface ChatConversationOverlaysProps {
  conversationId: string;
  user: { id: string } | null;
  otherUserId: string;
  chatName: string;
  chatAvatar: string | null;
  isGroup?: boolean;
  messages: ChatMessage[];

  deleteDialog: DeleteDialogState;
  setDeleteDialog: Dispatch<SetStateAction<DeleteDialogState>>;
  hideMessageForMe: (id: string) => void;
  deleteMessage: (id: string) => Promise<{ error: string | null }>;

  showVideoRecorder: boolean;
  setShowVideoRecorder: (v: boolean) => void;
  handleVideoRecord: (blob: Blob, duration: number) => Promise<void>;
  sendTyping: (isTyping: boolean, activity?: "typing" | "recording_voice" | "recording_video") => void;

  showAttachmentSheet: boolean;
  setShowAttachmentSheet: (v: boolean) => void;
  handleAttachment: (file: File, type: 'image' | 'video' | 'document') => Promise<void>;
  handleAlbumFiles: (files: File[], types: ("image" | "video")[]) => void;
  handleLocationSelect: () => Promise<void>;
  showContactSheet: boolean;
  setShowContactSheet: (v: boolean) => void;

  showAlbumPreview: boolean;
  setShowAlbumPreview: (v: boolean) => void;
  albumFiles: File[];
  setAlbumFiles: Dispatch<SetStateAction<File[]>>;
  albumInputRef: Ref<HTMLInputElement>;
  handleAlbumAddMore: () => void;
  handleAlbumAddMoreChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleAlbumSend: (caption: string) => Promise<void>;

  showCameraSheet: boolean;
  setShowCameraSheet: (v: boolean) => void;

  viewingImage: string | null;
  setViewingImage: (v: string | null) => void;
  viewingVideo: string | null;
  setViewingVideo: (v: string | null) => void;

  forwardOpen: boolean;
  setForwardOpen: (v: boolean) => void;
  forwardMessage: ChatMessage | null;

  showGiftCatalog: boolean;
  setShowGiftCatalog: (v: boolean) => void;

  showTimerPicker: boolean;
  setShowTimerPicker: (v: boolean) => void;
  defaultTimer: number | null;
  setConversationTimer: (v: number | null) => void;

  selectionMode: boolean;
  selectedIds: Set<string>;
  copySelected: () => void;
  deleteSelectedForMe: () => void;
  clearSelection: () => void;

  contextMenuMessage: ContextMenuState | null;
  setContextMenuMessage: (v: null) => void;
  handleMessageDelete: (id: string) => void;
  handleMessagePin: (id: string) => void;
  handleMessageReaction: (id: string, emoji: string) => void;
  handleMessageReply: (id: string) => void;
  handleMessageForward: (id: string) => void;
  handleMessageSelect: (id: string) => void;
  handleMessageSave: (id: string) => Promise<void>;
  handleMessageUnsave: (id: string) => void;
  handleMessageTranslate: (id: string, text: string) => void;
  handleMessageEdit: (id: string, content: string) => void;
  quickReactions: string[];
  isSaved: (id: string) => boolean;

  showPinnedSheet: boolean;
  setShowPinnedSheet: (v: boolean) => void;
  pinnedMessages: PinnedMessage[];
  scrollToMessage: (id: string) => void;
  unpinMessage: (id: string) => void;

  showScheduledList: boolean;
  setShowScheduledList: (v: boolean) => void;
  scheduledMessages: ScheduledMessage[];
  sendScheduledNow: (id: string) => Promise<void>;
  deleteScheduledMessage: (id: string) => Promise<void>;
  showSchedulePicker: boolean;
  setShowSchedulePicker: (v: boolean) => void;
  pendingScheduleContent: string;
  setPendingScheduleContent: (v: string) => void;
  scheduleMessage: (input: { conversation_id: string; content: string; scheduled_for: string }) => Promise<unknown>;
  setInputText: (v: string) => void;

  showMessageSearch: boolean;
  setShowMessageSearch: (v: boolean) => void;

  /**
   * Расшифрованный кэш сообщений для локального поиска в E2EE-чате.
   * Если задан — MessageSearchSheet ищет по нему, минуя серверный ilike.
   */
  decryptedCache?: Record<string, string | null>;
  senderProfiles?: Record<string, { display_name: string | null; avatar_url: string | null }>;

  showCreatePoll: boolean;
  setShowCreatePoll: (v: boolean) => void;

  showChatSettings: boolean;
  setShowChatSettings: (v: boolean) => void;

  showJumpToPicker: boolean;
  setShowJumpToPicker: (v: boolean) => void;
}

export function ChatConversationOverlays({
  conversationId, user, otherUserId, chatName, chatAvatar, isGroup, messages,
  deleteDialog, setDeleteDialog, hideMessageForMe, deleteMessage,
  showVideoRecorder, setShowVideoRecorder, handleVideoRecord, sendTyping,
  showAttachmentSheet, setShowAttachmentSheet, handleAttachment, handleAlbumFiles, handleLocationSelect,
  showContactSheet, setShowContactSheet,
  showAlbumPreview, setShowAlbumPreview, albumFiles, setAlbumFiles, albumInputRef,
  handleAlbumAddMore, handleAlbumAddMoreChange, handleAlbumSend,
  showCameraSheet, setShowCameraSheet,
  viewingImage, setViewingImage, viewingVideo, setViewingVideo,
  forwardOpen, setForwardOpen, forwardMessage,
  showGiftCatalog, setShowGiftCatalog,
  showTimerPicker, setShowTimerPicker, defaultTimer, setConversationTimer,
  selectionMode, selectedIds, copySelected, deleteSelectedForMe, clearSelection,
  contextMenuMessage, setContextMenuMessage,
  handleMessageDelete, handleMessagePin, handleMessageReaction,
  handleMessageReply, handleMessageForward, handleMessageSelect,
  handleMessageSave, handleMessageUnsave, handleMessageTranslate, handleMessageEdit,
  quickReactions, isSaved,
  showPinnedSheet, setShowPinnedSheet, pinnedMessages, scrollToMessage, unpinMessage,
  showScheduledList, setShowScheduledList, scheduledMessages, sendScheduledNow, deleteScheduledMessage,
  showSchedulePicker, setShowSchedulePicker, pendingScheduleContent, setPendingScheduleContent,
  scheduleMessage, setInputText,
  showMessageSearch, setShowMessageSearch,
  decryptedCache, senderProfiles,
  showCreatePoll, setShowCreatePoll,
  showChatSettings, setShowChatSettings,
  showJumpToPicker, setShowJumpToPicker,
}: ChatConversationOverlaysProps) {
  // Локальный индекс для E2EE-поиска — вычисляется только когда поиск открыт,
  // чтобы не пересобирать его на каждом рендере чата.
  const localSearchMessages = useMemo<LocalSearchMessage[] | undefined>(() => {
    if (!showMessageSearch || !decryptedCache) return undefined;
    const result: LocalSearchMessage[] = [];
    for (const m of messages) {
      const decrypted = decryptedCache[m.id];
      // Для E2EE сообщений без расшифровки — пропускаем (не можем искать по шифротексту).
      // Для plaintext (systems, shared posts) — используем m.content.
      const text = typeof decrypted === "string" && decrypted.length > 0
        ? decrypted
        : (m.is_encrypted ? "" : m.content ?? "");
      if (!text) continue;
      const profile = senderProfiles?.[m.sender_id];
      result.push({
        id: m.id,
        decryptedText: text,
        sender_id: m.sender_id,
        sender_name: profile?.display_name ?? null,
        sender_avatar: profile?.avatar_url ?? null,
        conversation_id: m.conversation_id,
        created_at: m.created_at,
        media_type: m.media_type ?? null,
        media_url: m.media_url ?? null,
      });
    }
    return result;
  }, [showMessageSearch, decryptedCache, senderProfiles, messages]);

  return (
    <>
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить сообщение?</AlertDialogTitle>
            <AlertDialogDescription>Выберите вариант удаления.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteDialog.messageId) {
                  hideMessageForMe(deleteDialog.messageId);
                  toast.success("Удалено у вас");
                }
              }}
            >
              У меня
            </AlertDialogAction>
            <AlertDialogAction
              onClick={async () => {
                const id = deleteDialog.messageId;
                if (!id) return;
                const msg = messages.find((m) => m.id === id);
                if (!msg || msg.sender_id !== user?.id) {
                  toast.error("Можно удалить у всех только свои сообщения");
                  return;
                }
                const result = await deleteMessage(id);
                if (result.error) {
                  toast.error("Не удалось удалить сообщение");
                } else {
                  toast.success("Удалено у всех");
                }
              }}
            >
              У всех
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showVideoRecorder && (
        <VideoCircleRecorder
          onRecord={handleVideoRecord}
          onCancel={() => {
            setShowVideoRecorder(false);
            sendTyping(false, "recording_video");
          }}
        />
      )}

      <AttachmentSheet
        open={showAttachmentSheet}
        onOpenChange={setShowAttachmentSheet}
        onSelectFile={handleAttachment}
        onSelectFiles={handleAlbumFiles}
        onSelectLocation={handleLocationSelect}
        onContactShare={() => setShowContactSheet(true)}
        onOpenCamera={() => setShowCameraSheet(true)}
      />

      {showAlbumPreview && albumFiles.length > 0 && (
        <MediaAlbumPreview
          files={albumFiles}
          onRemove={(idx) => {
            setAlbumFiles((prev) => prev.filter((_, i) => i !== idx));
            if (albumFiles.length <= 1) setShowAlbumPreview(false);
          }}
          onAddMore={handleAlbumAddMore}
          onSend={handleAlbumSend}
          onCancel={() => { setShowAlbumPreview(false); setAlbumFiles([]); }}
        />
      )}
      <input
        ref={albumInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleAlbumAddMoreChange}
      />

      <CameraCaptureSheet
        open={showCameraSheet}
        onOpenChange={setShowCameraSheet}
        settingsScopeKey={`dm:${conversationId}`}
        onSendFile={async (file, type) => {
          await handleAttachment(file, type);
        }}
      />

      {viewingImage && (
        <ImageViewer src={viewingImage} onClose={() => setViewingImage(null)} />
      )}

      {viewingVideo && (
        <FullscreenVideoPlayer src={viewingVideo} onClose={() => setViewingVideo(null)} />
      )}

      <ForwardMessageSheet
        open={forwardOpen}
        onOpenChange={setForwardOpen}
        message={forwardMessage}
      />

      <ContactShareSheet
        open={showContactSheet}
        onOpenChange={setShowContactSheet}
        onSendContact={async (contact) => {
          if (!conversationId || !user) return;
          const clientMsgId = crypto.randomUUID();
          const envelope = buildChatBodyEnvelope({
            kind: 'contact',
            contact: { name: contact.name, phone: contact.phone },
          });
          try {
            await sendMessageV1({ conversationId, clientMsgId, body: envelope });
          } catch (e) {
            toast.error("Не удалось отправить");
            logger.error("chat: send contact failed", { conversationId, error: e });
          }
        }}
      />

      {!isGroup && (
        <GiftCatalog
          open={showGiftCatalog}
          onClose={() => setShowGiftCatalog(false)}
          recipientId={otherUserId}
          recipientName={chatName}
          recipientAvatar={chatAvatar}
          conversationId={conversationId}
          onGiftSent={async (giftEmoji, giftName, sentGiftId) => {
            const clientMsgId = crypto.randomUUID();
            const envelope = buildChatBodyEnvelope({
              kind: 'gift',
              gift_emoji: giftEmoji,
              gift_name: giftName,
              sent_gift_id: sentGiftId,
              stars_spent: 0,
              is_opened: false,
            });
            try {
              await sendMessageV1({ conversationId, clientMsgId, body: envelope });
            } catch (e) {
              toast.error("Не удалось отправить");
              logger.error("chat: send gift message failed", { conversationId, error: e });
            }
          }}
        />
      )}

      <DisappearTimerPicker
        open={showTimerPicker}
        onOpenChange={setShowTimerPicker}
        currentTimer={defaultTimer}
        onSelect={setConversationTimer}
      />

      {selectionMode && (
        <div className="fixed bottom-[84px] left-0 right-0 z-[250] px-4">
          <div className="mx-auto max-w-[520px] rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 px-3 py-2 flex items-center justify-between gap-2">
            <div className="text-sm text-white/80">Выбрано: {selectedIds.size}</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={copySelected}>
                Скопировать
              </Button>
              <Button size="sm" variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={deleteSelectedForMe}>
                Удалить у меня
              </Button>
              <Button size="sm" variant="ghost" className="text-white/70 hover:bg-white/10" onClick={clearSelection}>
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}

      {contextMenuMessage && (
        <MessageContextMenu
          isOpen
          onClose={() => setContextMenuMessage(null)}
          messageId={contextMenuMessage.id}
          messageContent={contextMenuMessage.content}
          isOwn={contextMenuMessage.isOwn}
          position={contextMenuMessage.position}
          onDelete={handleMessageDelete}
          onPin={handleMessagePin}
          onReaction={handleMessageReaction}
          quickReactions={quickReactions}
          onReply={handleMessageReply}
          onForward={handleMessageForward}
          onSelect={handleMessageSelect}
          onSave={handleMessageSave}
          onUnsave={handleMessageUnsave}
          isSaved={isSaved(contextMenuMessage.id)}
          onTranslate={handleMessageTranslate}
          onEdit={handleMessageEdit}
          onReport={!contextMenuMessage.isOwn ? (msgId) => {
            toast.info("Жалоба отправлена на рассмотрение");
            logger.info("chat: message reported", { messageId: msgId, conversationId });
          } : undefined}
        />
      )}

      <PinnedMessagesSheet
        open={showPinnedSheet}
        onClose={() => setShowPinnedSheet(false)}
        pinnedMessages={pinnedMessages}
        onScrollTo={(messageId) => {
          scrollToMessage(messageId);
          setShowPinnedSheet(false);
        }}
        onUnpin={unpinMessage}
      />

      <ScheduledMessagesList
        open={showScheduledList}
        onClose={() => setShowScheduledList(false)}
        scheduledMessages={scheduledMessages}
        onSendNow={async (id) => {
          try {
            await sendScheduledNow(id);
          } catch (error) {
            logger.warn("chat: failed to send scheduled message now", {
              conversationId, scheduledMessageId: id, error,
            });
            toast.error('Не удалось отправить сообщение');
          }
        }}
        onEdit={(msg) => {
          setPendingScheduleContent(msg.content);
          setShowScheduledList(false);
          setShowSchedulePicker(true);
        }}
        onDelete={async (id) => {
          try {
            await deleteScheduledMessage(id);
          } catch (error) {
            logger.warn("chat: failed to delete scheduled message", {
              conversationId, scheduledMessageId: id, error,
            });
            toast.error('Не удалось удалить запланированное сообщение');
          }
        }}
      />

      <ScheduleMessagePicker
        open={showSchedulePicker}
        onClose={() => setShowSchedulePicker(false)}
        messagePreview={pendingScheduleContent}
        onSchedule={async (scheduledFor) => {
          if (!conversationId || !pendingScheduleContent) return;
          try {
            await scheduleMessage({
              conversation_id: conversationId,
              content: pendingScheduleContent,
              scheduled_for: scheduledFor,
            });
            setInputText('');
            setPendingScheduleContent('');
            toast.success('Сообщение запланировано');
          } catch (error) {
            logger.warn("chat: failed to schedule message", { conversationId, error });
            toast.error('Не удалось запланировать сообщение');
          }
        }}
      />

      <MessageSearchSheet
        open={showMessageSearch}
        onOpenChange={setShowMessageSearch}
        conversationId={conversationId}
        onSelectMessage={(msgId) => scrollToMessage(msgId)}
        localMessages={localSearchMessages}
      />

      {conversationId && (
        <CreatePollSheet
          open={showCreatePoll}
          onOpenChange={setShowCreatePoll}
          conversationId={conversationId}
          onCreated={async (pollId) => {
            const clientMsgId = crypto.randomUUID();
            const envelope = buildChatBodyEnvelope({ kind: 'poll', poll_id: pollId });
            try {
              await sendMessageV1({ conversationId, clientMsgId, body: envelope });
            } catch (e) {
              toast.error("Не удалось отправить");
              logger.error("chat: send poll failed", { conversationId, error: e });
            }
          }}
        />
      )}

      <ChatSettingsSheet
        conversationId={conversationId}
        open={showChatSettings}
        onClose={() => setShowChatSettings(false)}
      />

      <JumpToDatePicker
        open={showJumpToPicker}
        onClose={() => setShowJumpToPicker(false)}
        messages={messages}
        onJump={scrollToMessage}
      />
    </>
  );
}
