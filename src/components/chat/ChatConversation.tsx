import { useState, useRef, useCallback, useMemo } from "react";
import { ChatMessageList } from "./ChatMessageList";
import { ChatConversationOverlays } from "./ChatConversationOverlays";
import { useChatMessageActions } from "@/hooks/useChatMessageActions";
import { useChatMedia } from "@/hooks/useChatMedia";
import { useChatSend } from "@/hooks/useChatSend";
import { useChatInteraction } from "@/hooks/useChatInteraction";
import { useChatDataLoading } from "@/hooks/useChatDataLoading";
import { useChatNotifications } from "@/hooks/useChatNotifications";
import { useChatScrollUI } from "@/hooks/useChatScrollUI";
import { useChatLifecycle } from "@/hooks/useChatLifecycle";
import { AnimatedEmojiFullscreen } from "./AnimatedEmojiFullscreen";
import { ChatHeader } from "./ChatHeader";
import { ChatConversationInput } from "./ChatConversationInput";
import { useBubbleGradient } from "@/hooks/useBubbleGradient";
import { FloatingDate } from "./FloatingDate";
import { ScrollToBottomFab } from "./ScrollToBottomFab";
import { useSecretChat } from "@/hooks/useSecretChat";
import { usePolls } from "@/hooks/usePolls";
import { SecretChatBanner } from "./SecretChatBanner";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { usePinnedMessages } from "@/hooks/usePinnedMessages";
import { useScheduledMessages } from "@/hooks/useScheduledMessages";
import { useSavedMessages } from "@/hooks/useSavedMessages";
import { useMessageTranslation } from "@/hooks/useMessageTranslation";
import { PinnedMessageBar } from "./PinnedMessageBar";
import { useE2EEncryption } from "@/hooks/useE2EEncryption";
import { useMessages } from "@/hooks/useChat";
import { useMessageReactions } from "@/hooks/useMessageReactions";
import { useAuth } from "@/hooks/useAuth";
import { useMarkConversationRead } from "@/hooks/useMarkConversationRead";
import { useVideoCallContext } from "@/contexts/VideoCallContext";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { toast } from "sonner";


import { MessageEffectOverlay } from "./MessageEffectOverlay";
import type { MessageEffectType } from "./MessageEffectOverlay";
import { ChatBackground } from "./ChatBackground";
import { useChatSettings } from "@/hooks/useChatSettings";

import {
  getMentionSuggestions,
  insertMention,
} from "@/hooks/useMentions";

import { useMessageDensity } from "@/hooks/useMessageDensity";
import { useChatDrafts } from "@/hooks/useChatDrafts";
import { useDisappearingMessages } from "@/hooks/useDisappearingMessages";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useVoiceMedia } from "@/hooks/useVoiceMedia";
import { useUserPresenceStatus } from "@/hooks/useUserPresenceStatus";
import { useAppearanceRuntime } from "@/contexts/AppearanceRuntimeContext";

import { resolveChatMediaDownloadPrefs } from "@/lib/chat/mediaSettings";


interface ChatConversationProps {
  conversationId: string;
  chatName: string;
  chatAvatar: string | null;
  otherUserId: string;
  onBack: () => void;
  participantCount?: number;
  isGroup?: boolean;
  totalUnreadCount?: number;
  /** Called to refresh conversation list after marking messages read */
  onRefetch?: () => void;
  initialOpenPanelAction?: "settings" | "timer" | "scheduled";
  onInitialPanelHandled?: () => void;
}

const TELEGRAM_MAX_MESSAGE_CHARS = 4096;

export function ChatConversation({ conversationId, chatName, chatAvatar, otherUserId, onBack, participantCount, isGroup, totalUnreadCount, onRefetch, initialOpenPanelAction, onInitialPanelHandled }: ChatConversationProps) {
  const { user } = useAuth();
  const { getDraft, saveDraft, clearDraft } = useChatDrafts();
  const { settings } = useUserSettings();
  const { settings: chatSettings, globalSettings } = useChatSettings(conversationId);
  const { appearance, energy } = useAppearanceRuntime();
  const { bubbleClass } = useBubbleGradient();
  const { styles: densityStyles } = useMessageDensity();
  const [lastSentEmoji, setLastSentEmoji] = useState<string | null>(null);
  const { messages, loading, fetchError, refetch, sendMessage, sendMediaMessage, deleteMessage, editMessage } = useMessages(conversationId);
  const { toggleReaction, getReactions } = useMessageReactions(conversationId);
  const { markConversationRead } = useMarkConversationRead();
  const { getMessageStatus, markAsRead, markAsDelivered } = useReadReceipts(conversationId);
  const { pinnedMessages, pinMessage, unpinMessage } = usePinnedMessages(conversationId);
  const { saveMessage: saveToSavedMessages, removeSavedByOriginalId, isSaved } = useSavedMessages();
  const { translate } = useMessageTranslation();
  const {
    scheduledMessages,
    scheduleMessage,
    deleteScheduledMessage,
    sendNow: sendScheduledNow,
  } = useScheduledMessages(conversationId);
  const { startCall } = useVideoCallContext();
  const { setIsChatOpen } = useChatOpen();

  const {
    encryptionEnabled,
    encryptContent,
    decryptContent,
  } = useE2EEncryption(conversationId);

  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [recordMode, setRecordMode] = useState<'voice' | 'video'>('voice');
  const [manualMediaLoaded, setManualMediaLoaded] = useState<Set<string>>(new Set());

  const {
    showVideoRecorder, setShowVideoRecorder,
    showAlbumPreview, setShowAlbumPreview,
    showCameraSheet, setShowCameraSheet,
    viewingImage, setViewingImage, viewingVideo, setViewingVideo,
    albumFiles, setAlbumFiles, albumInputRef,
    handleVideoRecord, handleAttachment, handleAlbumFiles,
    handleAlbumAddMore, handleAlbumAddMoreChange, handleAlbumSend,
    handleLocationSelect,
  } = useChatMedia({ conversationId, sendMediaMessage, isSending, setIsSending });

  const [aiStreamText, setAiStreamText] = useState<string | null>(null);

  const energyMediaPreload = energy?.media_preload ?? true;
  const energyVideoAutoplay = energy?.autoplay_video ?? true;
  const mediaTapEnabled = appearance?.media_tap_navigation_enabled ?? true;
  const messageCornerRadius = appearance?.message_corner_radius ?? 18;
  const { autoDownloadPhotos, autoDownloadVideos } = resolveChatMediaDownloadPrefs({
    chatSettings,
    userSettings: settings,
    energy: {
      media_preload: energyMediaPreload,
      autoplay_video: energyVideoAutoplay,
    },
  });

  const {
    isOnline: isOtherOnline,
    statusText: otherPresenceText,
    statusEmoji: otherStatusEmoji,
    statusStickerUrl: otherStatusStickerUrl,
  } = useUserPresenceStatus(
    !isGroup ? otherUserId : null,
  );

  // Typing indicator: useTypingIndicator handles DM + group, presence-based, multi-device-safe
  const {
    typingLabel,
    onKeyDown: typingOnKeyDown,
    onStopTyping: typingOnStop,
    onStartRecordingVoice: typingOnStartVoice,
    onStartRecordingVideo: typingOnStartVideo,
    onStopRecording: typingOnStopRecording,
  } = useTypingIndicator(
    conversationId,
    user?.id,
    chatName ?? null,
    chatAvatar ?? null,
  );
  // Derive typing state for the header status text
  const isOtherTyping = !!typingLabel;

  const {
    isRecording, recordingTime, playingVoice, voicePlaybackRate,
    startRecording, stopRecording, cancelRecording,
    toggleVoicePlay, cycleVoiceSpeed, getWaveformHeights,
  } = useVoiceMedia({
    conversationId,
    sendMediaMessage,
    typingOnKeyDown: typingOnStartVoice,
    typingOnStop: typingOnStopRecording,
  });

  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const {
    decryptedCache, hideMessageForMe, visibleMessages, scrollToMessage,
    quickReactions, senderProfiles, mentionParticipants, renderText, replyKeyboard,
  } = useChatDataLoading({
    conversationId, user, messages, isGroup: !!isGroup, decryptContent, messageRefs,
  });

  const [replyTo, setReplyTo] = useState<{ id: string; preview: string } | null>(null);
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | null>(null);

  const [showPinnedSheet, setShowPinnedSheet] = useState(false);
  const [showScheduledList, setShowScheduledList] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [pendingScheduleContent, setPendingScheduleContent] = useState('');

  // ─── Silent send ─────────────────────────────────────────────────────────────
  const [isSilentSend, setIsSilentSend] = useState(false);
  const [showSendOptions, setShowSendOptions] = useState(false);

  // ─── Message effects ─────────────────────────────────────────────────────────
  const [activeEffect, setActiveEffect] = useState<MessageEffectType | null>(null);

  // ─── Inline bot state ────────────────────────────────────────────────────────
  const [inlineBotTrigger, setInlineBotTrigger] = useState<{ botUsername: string; query: string } | null>(null);

  const [mentionTrigger, setMentionTrigger] = useState<{ query: string; triggerStart: number } | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const mentionSuggestions = useMemo(
    () => mentionTrigger ? getMentionSuggestions(mentionTrigger.query, mentionParticipants) : [],
    [mentionTrigger, mentionParticipants]
  );

  const [showGiftCatalog, setShowGiftCatalog] = useState(false);
  const [showContactSheet, setShowContactSheet] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const {
    defaultTimer,
    setConversationTimer,
    enrichMessageWithDisappear,
  } = useDisappearingMessages(conversationId);

  const { isSecret, secretChat } = useSecretChat(conversationId);
  const _polls = usePolls(conversationId);

  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  
  // Context menu state
  const [contextMenuMessage, setContextMenuMessage] = useState<{
    id: string;
    content: string;
    isOwn: boolean;
    position: { top: number; left: number; width: number };
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // UI-3: textarea ref (HTMLTextAreaElement for AutoGrowTextarea)
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // UI-1 / UI-2: scroll container ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // UI-6: jump-to-date picker
  const [showJumpToPicker, setShowJumpToPicker] = useState(false);

  useChatLifecycle({
    conversationId, inputText, setInputText, setIsChatOpen,
    getDraft, saveDraft, clearDraft,
    initialOpenPanelAction, onInitialPanelHandled,
    setShowChatSettings, setShowTimerPicker, setShowScheduledList,
  });

  const {
    selectionMode, selectedIds,
    deleteDialog, setDeleteDialog,
    forwardOpen, setForwardOpen, forwardMessage,
    handleMessageDelete, handleMessagePin, handleMessageReaction,
    handleMessageEdit, handleMessageReply, handleMessageForward,
    handleMessageSelect, handleMessageSave, handleMessageUnsave,
    handleMessageTranslate, toggleSelected, clearSelection,
    deleteSelectedForMe, copySelected,
  } = useChatMessageActions({
    conversationId,
    userId: user?.id,
    messages,
    visibleMessages,
    pinnedMessages,
    pinMessage,
    unpinMessage,
    toggleReaction,
    saveToSavedMessages,
    removeSavedByOriginalId,
    translate,
    hideMessageForMe,
    inputRef,
    setEditingMessage,
    setInputText,
    setReplyTo,
  });

  // Typing is handled by useTypingIndicator hook (see state section above).
  const sendTyping = useCallback(
    (isTyping: boolean, activity: "typing" | "recording_voice" | "recording_video" = "typing") => {
      if (!isTyping) {
        if (activity === "typing") typingOnStop();
        else typingOnStopRecording();
        return;
      }
      if (activity === "recording_voice") typingOnStartVoice();
      else if (activity === "recording_video") typingOnStartVideo();
      else typingOnKeyDown();
    },
    [typingOnKeyDown, typingOnStop, typingOnStartVoice, typingOnStartVideo, typingOnStopRecording],
  );

  const { handleSendMessage, handleInputChange, sendWithEffect, handleStickerSend, handleGifSend } = useChatSend({
    conversationId, user,
    inputText, setInputText,
    editingMessage, setEditingMessage, editMessage,
    replyTo, setReplyTo, setQuotedText,
    inputRef, setIsSending,
    setLastSentEmoji, isSilentSend, setIsSilentSend,
    setActiveEffect, clearDraft,
    sendMessage, sendTyping,
    encryptionEnabled, encryptContent, enrichMessageWithDisappear,
    setInlineBotTrigger, setMentionTrigger, setMentionActiveIndex, typingOnKeyDown,
  });

  const { headerStatusText } = useChatNotifications({
    conversationId, user, messages, isGroup,
    participantCount, typingLabel, isOtherTyping, otherPresenceText,
    markConversationRead, onRefetch, markAsRead, markAsDelivered,
    chatNotifSettings: chatSettings,
    globalNotifSettings: globalSettings,
  });

  const { floatingDate, showScrollFab } = useChatScrollUI({
    scrollContainerRef, messagesEndRef, messages, aiStreamText,
  });

  const {
    handleStartAudioCall, handleStartVideoCall,
    handleRecordButtonDown, handleRecordButtonUp, handleRecordButtonLeave,
    handleMessageLongPressStart, handleMessageLongPressEnd,
  } = useChatInteraction({
    conversationId, otherUserId, chatName, chatAvatar,
    recordMode, isRecording, startRecording, stopRecording,
    setShowVideoRecorder, setRecordMode, sendTyping,
    startCall, setContextMenuMessage,
  });

  // ── Props for ChatMessageItem ──────────────────────────────────
  // Стабильные ссылки критичны: ChatMessageItem обёрнут в React.memo,
  // и при пересоздании этих объектов на каждом рендере мемоизация
  // становится бесполезной (ссылочное сравнение падает).
  const messageStyleConfig = useMemo(() => ({
    bubbleClass,
    densityStyles,
    fontSizeSetting: chatSettings.font_size as "small" | "medium" | "large" | undefined,
    bubbleStyleSetting: chatSettings.bubble_style as "classic" | "minimal" | "modern" | undefined,
    messageCornerRadius,
    autoDownloadPhotos,
    autoDownloadVideos,
    mediaTapEnabled,
    linkPreviewEnabled: globalSettings.link_preview_enabled,
  }), [
    bubbleClass,
    densityStyles,
    chatSettings.font_size,
    chatSettings.bubble_style,
    messageCornerRadius,
    autoDownloadPhotos,
    autoDownloadVideos,
    mediaTapEnabled,
    globalSettings.link_preview_enabled,
  ]);

  const messageCallbacks = useMemo(() => ({
    onReply: handleMessageReply,
    onDelete: async (msgId: string) => {
      const result = await deleteMessage(msgId);
      if (result.error) toast.error("Не удалось удалить сообщение");
    },
    onReaction: handleMessageReaction,
    onLongPressStart: handleMessageLongPressStart,
    onLongPressEnd: handleMessageLongPressEnd,
    onManualLoad: (msgId: string) => setManualMediaLoaded((prev) => { const next = new Set(prev); next.add(msgId); return next; }),
    onViewImage: (url: string) => setViewingImage(url),
    onViewVideo: (url: string) => setViewingVideo(url),
    toggleSelected,
    getReactions,
    getMessageStatus,
    toggleVoicePlay,
    cycleVoiceSpeed,
    voicePlaybackRate,
    getWaveformHeights,
    renderText,
  }), [
    handleMessageReply,
    deleteMessage,
    handleMessageReaction,
    handleMessageLongPressStart,
    handleMessageLongPressEnd,
    setManualMediaLoaded,
    setViewingImage,
    setViewingVideo,
    toggleSelected,
    getReactions,
    getMessageStatus,
    toggleVoicePlay,
    cycleVoiceSpeed,
    voicePlaybackRate,
    getWaveformHeights,
    renderText,
  ]);

  return (
    <div className="fixed inset-0 flex flex-col bg-background z-[200]">
      <AnimatedEmojiFullscreen emoji={lastSentEmoji} onComplete={() => setLastSentEmoji(null)} />
      <MessageEffectOverlay effect={activeEffect} onComplete={() => setActiveEffect(null)} />

      <ChatHeader
        conversationId={conversationId}
        chatName={chatName}
        chatAvatar={chatAvatar}
        otherUserId={otherUserId}
        isGroup={isGroup}
        totalUnreadCount={totalUnreadCount}
        headerStatusText={headerStatusText}
        isOtherOnline={isOtherOnline}
        isOtherTyping={isOtherTyping}
        otherStatusEmoji={otherStatusEmoji}
        otherStatusStickerUrl={otherStatusStickerUrl}
        onBack={onBack}
        onStartAudioCall={handleStartAudioCall}
        onStartVideoCall={handleStartVideoCall}
        onSearchOpen={() => setShowMessageSearch(true)}
        onAddMembers={isGroup ? () => setShowChatSettings(true) : undefined}
      />

      {isSecret && (
        <SecretChatBanner ttlSeconds={secretChat?.default_ttl_seconds ?? undefined} />
      )}

      <PinnedMessageBar
        pinnedMessages={pinnedMessages}
        onScrollTo={scrollToMessage}
        onLongPress={() => setShowPinnedSheet(true)}
      />

      {/* Messages - scrollable with animated brand background */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden native-scroll flex flex-col relative" onClick={() => { if (showEmojiPicker) setShowEmojiPicker(false); }}>
        {/* UI-1: Floating date pill */}
        <FloatingDate
          date={floatingDate}
          onClick={() => setShowJumpToPicker(true)}
        />
        {/* UI-2: Scroll-to-bottom FAB */}
        <ScrollToBottomFab
          visible={showScrollFab}
          unreadCount={totalUnreadCount}
          onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
        />
      <ChatBackground wallpaper={chatSettings.chat_wallpaper} className="flex-1 flex flex-col min-h-full">
        {/* Content layer */}
        <div className="relative z-10 flex-1 flex flex-col p-4 overflow-x-hidden min-w-0">
        {/* Spacer to push messages to bottom */}
        <div className="flex-1" />
        
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        )}

        {!loading && fetchError && (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <p className="text-sm text-destructive">{fetchError}</p>
            <button
              onClick={() => void refetch()}
              className="text-sm text-primary underline hover:no-underline"
            >
              Повторить
            </button>
          </div>
        )}

        {!loading && !fetchError && visibleMessages.length === 0 && (
          <div className="flex items-center justify-center py-8 text-center">
            <p className="text-muted-foreground">Начните переписку!</p>
          </div>
        )}
        
        <ChatMessageList
          messages={visibleMessages}
          userId={user?.id}
          conversationId={conversationId}
          chatAvatar={chatAvatar}
          isGroup={isGroup}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          playingVoice={playingVoice}
          manualMediaLoaded={manualMediaLoaded}
          contextMenuMessageId={contextMenuMessage?.id ?? null}
          decryptedCache={decryptedCache}
          senderProfiles={senderProfiles}
          style={messageStyleConfig}
          callbacks={messageCallbacks}
          scrollContainerRef={scrollContainerRef}
          messagesEndRef={messagesEndRef}
        />
        </div>
      </ChatBackground>
      </div>{/* end scrollContainerRef div */}

      <ChatConversationInput
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
        maxLength={TELEGRAM_MAX_MESSAGE_CHARS}
        editingMessage={editingMessage}
        replyTo={replyTo}
        quotedText={quotedText}
        inlineBotTrigger={inlineBotTrigger}
        mentionTrigger={mentionTrigger}
        mentionSuggestions={mentionSuggestions}
        mentionActiveIndex={mentionActiveIndex}
        inputRef={inputRef}
        replyKeyboard={replyKeyboard}
        setInputText={setInputText}
        setShowEmojiPicker={setShowEmojiPicker}
        setQuotedText={setQuotedText}
        setReplyTo={setReplyTo}
        onInputChange={handleInputChange}
        onSend={(silent, overrideText) => void handleSendMessage(silent, overrideText)}
        onCancelRecording={cancelRecording}
        onStopRecording={stopRecording}
        onRecordButtonDown={handleRecordButtonDown}
        onRecordButtonUp={handleRecordButtonUp}
        onRecordButtonLeave={handleRecordButtonLeave}
        onSetShowTimerPicker={setShowTimerPicker}
        onSetShowAttachmentSheet={setShowAttachmentSheet}
        onSetShowGiftCatalog={setShowGiftCatalog}
        onSetShowCreatePoll={setShowCreatePoll}
        onSetShowSendOptions={setShowSendOptions}
        onSetPendingScheduleContent={setPendingScheduleContent}
        onSetShowSchedulePicker={setShowSchedulePicker}
        onCancelEdit={() => { setEditingMessage(null); setInputText(""); }}
        onCancelReply={() => { setReplyTo(null); setQuotedText(null); }}
        onScrollToReply={scrollToMessage}
        onMentionSelect={(user) => {
          if (!mentionTrigger) return;
          const caret = inputRef.current?.selectionStart ?? inputText.length;
          const { newText, newCaretPos } = insertMention(inputText, caret, mentionTrigger.triggerStart, user.username ?? user.display_name ?? user.user_id);
          handleInputChange(newText, newCaretPos);
          setMentionTrigger(null);
          requestAnimationFrame(() => {
            if (inputRef.current) {
              inputRef.current.focus();
              inputRef.current.setSelectionRange(newCaretPos, newCaretPos);
            }
          });
        }}
        onMentionActiveIndexChange={setMentionActiveIndex}
        onMentionDismiss={() => setMentionTrigger(null)}
        onInlineBotSelect={(result) => void handleSendMessage(false, result.sendContent.text)}
        onInlineBotDismiss={() => setInlineBotTrigger(null)}
        onEffect={sendWithEffect}
        onToggleRecordMode={() => setRecordMode(p => p === 'voice' ? 'video' : 'voice')}
        handleStickerSend={handleStickerSend}
        handleGifSend={handleGifSend}
        conversationId={conversationId}
      />

      <ChatConversationOverlays
        conversationId={conversationId}
        user={user}
        otherUserId={otherUserId}
        chatName={chatName}
        chatAvatar={chatAvatar}
        isGroup={isGroup}
        messages={messages}
        deleteDialog={deleteDialog}
        setDeleteDialog={setDeleteDialog}
        hideMessageForMe={hideMessageForMe}
        deleteMessage={deleteMessage}
        showVideoRecorder={showVideoRecorder}
        setShowVideoRecorder={setShowVideoRecorder}
        handleVideoRecord={handleVideoRecord}
        sendTyping={sendTyping}
        showAttachmentSheet={showAttachmentSheet}
        setShowAttachmentSheet={setShowAttachmentSheet}
        handleAttachment={handleAttachment}
        handleAlbumFiles={handleAlbumFiles}
        handleLocationSelect={handleLocationSelect}
        showContactSheet={showContactSheet}
        setShowContactSheet={setShowContactSheet}
        showAlbumPreview={showAlbumPreview}
        setShowAlbumPreview={setShowAlbumPreview}
        albumFiles={albumFiles}
        setAlbumFiles={setAlbumFiles}
        albumInputRef={albumInputRef}
        handleAlbumAddMore={handleAlbumAddMore}
        handleAlbumAddMoreChange={handleAlbumAddMoreChange}
        handleAlbumSend={handleAlbumSend}
        showCameraSheet={showCameraSheet}
        setShowCameraSheet={setShowCameraSheet}
        viewingImage={viewingImage}
        setViewingImage={setViewingImage}
        viewingVideo={viewingVideo}
        setViewingVideo={setViewingVideo}
        forwardOpen={forwardOpen}
        setForwardOpen={setForwardOpen}
        forwardMessage={forwardMessage}
        showGiftCatalog={showGiftCatalog}
        setShowGiftCatalog={setShowGiftCatalog}
        showTimerPicker={showTimerPicker}
        setShowTimerPicker={setShowTimerPicker}
        defaultTimer={defaultTimer}
        setConversationTimer={setConversationTimer}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        copySelected={copySelected}
        deleteSelectedForMe={deleteSelectedForMe}
        clearSelection={clearSelection}
        contextMenuMessage={contextMenuMessage}
        setContextMenuMessage={setContextMenuMessage}
        handleMessageDelete={handleMessageDelete}
        handleMessagePin={handleMessagePin}
        handleMessageReaction={handleMessageReaction}
        handleMessageReply={handleMessageReply}
        handleMessageForward={handleMessageForward}
        handleMessageSelect={handleMessageSelect}
        handleMessageSave={handleMessageSave}
        handleMessageUnsave={handleMessageUnsave}
        handleMessageTranslate={handleMessageTranslate}
        handleMessageEdit={handleMessageEdit}
        quickReactions={quickReactions}
        isSaved={isSaved}
        showPinnedSheet={showPinnedSheet}
        setShowPinnedSheet={setShowPinnedSheet}
        pinnedMessages={pinnedMessages}
        scrollToMessage={scrollToMessage}
        unpinMessage={unpinMessage}
        showScheduledList={showScheduledList}
        setShowScheduledList={setShowScheduledList}
        scheduledMessages={scheduledMessages}
        sendScheduledNow={sendScheduledNow}
        deleteScheduledMessage={deleteScheduledMessage}
        showSchedulePicker={showSchedulePicker}
        setShowSchedulePicker={setShowSchedulePicker}
        pendingScheduleContent={pendingScheduleContent}
        setPendingScheduleContent={setPendingScheduleContent}
        scheduleMessage={scheduleMessage}
        setInputText={setInputText}
        showMessageSearch={showMessageSearch}
        setShowMessageSearch={setShowMessageSearch}
        decryptedCache={decryptedCache}
        senderProfiles={senderProfiles}
        showCreatePoll={showCreatePoll}
        setShowCreatePoll={setShowCreatePoll}
        showChatSettings={showChatSettings}
        setShowChatSettings={setShowChatSettings}
        showJumpToPicker={showJumpToPicker}
        setShowJumpToPicker={setShowJumpToPicker}
      />

    </div>
  );
}