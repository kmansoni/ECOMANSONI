import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Video, Send, Mic, X, Play, Pause, Check, CheckCheck, Smile } from "lucide-react";
import { AttachmentIcon } from "./AttachmentIcon";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/hooks/useChat";
import { useAuth } from "@/hooks/useAuth";
import { useMarkConversationRead } from "@/hooks/useMarkConversationRead";
import { useVideoCallContext } from "@/contexts/VideoCallContext";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { format } from "date-fns";
import { toast } from "sonner";
import { BrandBackground } from "@/components/ui/brand-background";
import { VideoCircleRecorder } from "./VideoCircleRecorder";
import { VideoCircleMessage } from "./VideoCircleMessage";
import { AttachmentSheet } from "./AttachmentSheet";
import { ImageViewer } from "./ImageViewer";
import { VideoPlayer, FullscreenVideoPlayer } from "./VideoPlayer";
import { SharedPostCard } from "./SharedPostCard";
import { SharedReelCard } from "./SharedReelCard";
import { EmojiStickerPicker } from "./EmojiStickerPicker";
import { MessageContextMenu } from "./MessageContextMenu";
import { supabase } from "@/integrations/supabase/client";
import { formatLastSeen } from "@/hooks/usePresence";

interface ChatConversationProps {
  conversationId: string;
  chatName: string;
  chatAvatar: string;
  otherUserId: string;
  onBack: () => void;
  participantCount?: number;
  isGroup?: boolean;
  totalUnreadCount?: number;
  /** Called to refresh conversation list after marking messages read */
  onRefetch?: () => void;
}

export function ChatConversation({ conversationId, chatName, chatAvatar, otherUserId, onBack, participantCount, isGroup, totalUnreadCount, onRefetch }: ChatConversationProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { messages, loading, sendMessage, sendMediaMessage, deleteMessage } = useMessages(conversationId);
  const { markConversationRead } = useMarkConversationRead();
  const { startCall } = useVideoCallContext();
  const { setIsChatOpen } = useChatOpen();
  
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [viewingVideo, setViewingVideo] = useState<string | null>(null);
  const [recordMode, setRecordMode] = useState<'voice' | 'video'>('voice');
  const [lastSeenStatus, setLastSeenStatus] = useState<string>("был(а) недавно");
  
  // Context menu state
  const [contextMenuMessage, setContextMenuMessage] = useState<{
    id: string;
    content: string;
    isOwn: boolean;
    position: { top: number; left: number; width: number };
  } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingMimeTypeRef = useRef<string | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);

  // Mark chat as open/closed for hiding bottom nav
  useEffect(() => {
    setIsChatOpen(true);
    return () => setIsChatOpen(false);
  }, [setIsChatOpen]);

  // Fetch other user's last_seen_at for presence status
  useEffect(() => {
    if (isGroup || !otherUserId) return;
    
    const fetchPresence = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("last_seen_at")
        .eq("user_id", otherUserId)
        .single();
      
      if (data?.last_seen_at) {
        setLastSeenStatus(formatLastSeen(data.last_seen_at));
      }
    };

    fetchPresence();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPresence, 30000);
    return () => clearInterval(interval);
  }, [otherUserId, isGroup]);

  // Mark incoming messages as read when chat is opened / receives new messages.
  useEffect(() => {
    // Only for DMs (groups/channels have separate infra).
    if (!conversationId || !user || isGroup) return;
    (async () => {
      await markConversationRead(conversationId);
      // Refresh list so unread badge updates immediately.
      onRefetch?.();
    })();
  }, [conversationId, user, isGroup, messages.length, markConversationRead, onRefetch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isRecording) {
      recordingInterval.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
      setRecordingTime(0);
    }
    return () => {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
    };
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "HH:mm");
    } catch {
      return "";
    }
  };

  const handleSendMessage = async () => {
    console.log("[handleSendMessage] inputText:", inputText);
    if (!inputText.trim()) {
      console.log("[handleSendMessage] empty input, skipping");
      return;
    }
    try {
      await sendMessage(inputText);
      setInputText("");
      // Keep focus on input to prevent keyboard closing on mobile
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } catch (error) {
      console.error("[handleSendMessage] error:", error);
      toast.error("Не удалось отправить сообщение");
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Pick best supported audio container/codec (iOS Safari often can't play webm/opus)
      const preferredTypes = [
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];

      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      recordingMimeTypeRef.current = mimeType || null;

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = async () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    const duration = recordingTime;
    
    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        const mimeType = recordingMimeTypeRef.current || mediaRecorderRef.current?.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        
        if (duration > 0) {
          const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
          const file = new File([audioBlob], `voice_${Date.now()}.${ext}`, { type: mimeType });
          await sendMediaMessage(file, 'voice', duration);
        }

        // Stop all tracks
        mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
        resolve();
      };

      mediaRecorderRef.current!.stop();
      setIsRecording(false);
    });
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
  };

  const toggleVoicePlay = async (messageId: string, mediaUrl?: string) => {
    if (playingVoice === messageId) {
      audioRef.current?.pause();
      setPlayingVoice(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (mediaUrl) {
        try {
          const audio = new Audio(mediaUrl);
          audio.onended = () => setPlayingVoice(null);
          audio.onerror = (e) => {
            console.error('Audio playback error:', e);
            setPlayingVoice(null);
          };
          await audio.play();
          audioRef.current = audio;
          setPlayingVoice(messageId);
        } catch (error) {
          console.error('Failed to play audio:', error);
          setPlayingVoice(null);
        }
      }
    }
  };

  // Generate stable waveform heights for voice messages
  const getWaveformHeights = useMemo(() => {
    const cache: Record<string, number[]> = {};
    return (messageId: string): number[] => {
      if (!cache[messageId]) {
        // Use message ID as seed for consistent random heights
        const heights: number[] = [];
        let seed = messageId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        for (let i = 0; i < 20; i++) {
          seed = (seed * 1103515245 + 12345) % 2147483648;
          heights.push((seed % 16) + 8);
        }
        cache[messageId] = heights;
      }
      return cache[messageId];
    };
  }, []);

  const handleVideoRecord = async (videoBlob: Blob, duration: number) => {
    const file = new File([videoBlob], `video_circle_${Date.now()}.webm`, { type: 'video/webm' });
    await sendMediaMessage(file, 'video_circle', duration);
    setShowVideoRecorder(false);
  };

  const handleAttachment = async (file: File, type: "image" | "video") => {
    if (type === "image") {
      await sendMediaMessage(file, 'image');
    } else {
      // For video files, we can add a 'video' type or reuse 'video_circle'
      await sendMediaMessage(file, 'video' as any);
    }
  };

  const handleStartAudioCall = async () => {
    await startCall(otherUserId, conversationId, "audio");
  };

  const handleStartVideoCall = async () => {
    await startCall(otherUserId, conversationId, "video");
  };

  // Hold-to-record handlers for dynamic mic/video button
  const holdStartedRef = useRef(false); // Track if mousedown happened on button

  const handleRecordButtonDown = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    isHoldingRef.current = false;
    holdStartedRef.current = true;
    
    holdTimerRef.current = setTimeout(() => {
      isHoldingRef.current = true;
      if (recordMode === 'voice') {
        startRecording();
      } else {
        setShowVideoRecorder(true);
      }
    }, 200); // 200ms delay to distinguish tap from hold
  }, [recordMode]);

  const handleRecordButtonUp = useCallback(() => {
    // Only process if button down started on this button
    if (!holdStartedRef.current) return;
    holdStartedRef.current = false;
    
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    
    if (isHoldingRef.current) {
      // This was a hold — stop voice recording (video auto-sends on release in VideoCircleRecorder)
      if (recordMode === 'voice' && isRecording) {
        stopRecording();
      }
    } else {
      // This was a tap — switch mode
      setRecordMode(prev => prev === 'voice' ? 'video' : 'voice');
    }
    isHoldingRef.current = false;
  }, [recordMode, isRecording]);

  // Cancel hold timer when mouse leaves (but don't switch mode)
  const handleRecordButtonLeave = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    // Don't reset holdStartedRef - mouseUp can still happen
  }, []);

  // Long press handlers for context menu
  const handleMessageLongPressStart = useCallback((
    messageId: string, 
    content: string, 
    isOwn: boolean,
    event: React.MouseEvent | React.TouchEvent
  ) => {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    
    longPressTimerRef.current = setTimeout(() => {
      setContextMenuMessage({ 
        id: messageId, 
        content, 
        isOwn,
        position: {
          top: rect.top,
          left: rect.left,
          width: rect.width
        }
      });
    }, 500);
  }, []);

  const handleMessageLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleMessageDelete = async (messageId: string) => {
    const result = await deleteMessage(messageId);
    if (result.error) {
      toast.error("Не удалось удалить сообщение");
    }
  };

  const handleMessagePin = async (messageId: string) => {
    // TODO: Implement pin functionality
    toast.success("Сообщение закреплено");
  };

  const handleMessageReaction = async (messageId: string, emoji: string) => {
    // TODO: Implement reaction functionality
    toast.success(`Реакция ${emoji} добавлена`);
  };

  const handleMessageReply = (messageId: string) => {
    // TODO: Implement reply functionality
    toast.info("Функция ответа в разработке");
  };

  const handleMessageForward = (messageId: string) => {
    // TODO: Implement forward functionality
    toast.info("Функция пересылки в разработке");
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-background z-[200]">
      {/* Header - transparent with glass effect */}
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
          
          {/* Avatar + Name + Status - clickable to profile */}
          <button
            onClick={() => navigate(`/contact/${otherUserId}`, { state: { name: chatName, avatar: chatAvatar, conversationId } })}
            className="flex items-center gap-3 flex-1 min-w-0 hover:bg-white/5 rounded-lg px-2 py-1 transition-colors"
          >
            <img
              src={chatAvatar}
              alt={chatName}
              className="w-10 h-10 rounded-full object-cover bg-[#6ab3f3] flex-shrink-0"
            />
            <div className="flex flex-col items-start min-w-0">
              <h2 className="font-semibold text-white text-base truncate max-w-[180px]">{chatName}</h2>
              <p className={`text-xs ${lastSeenStatus === 'онлайн' ? 'text-emerald-400' : 'text-[#6ab3f3]'}`}>
                {isGroup 
                  ? `${participantCount || 0} участник${participantCount === 1 ? '' : participantCount && participantCount < 5 ? 'а' : 'ов'}`
                  : lastSeenStatus
                }
              </p>
            </div>
          </button>
          
          {/* Right - Call buttons */}
          <div className="flex items-center">
            {/* Audio call button */}
            {!isGroup && (
              <button
                onClick={handleStartAudioCall}
                className="p-2 rounded-full hover:bg-white/10 active:bg-white/15 transition-colors"
                aria-label="Аудиозвонок"
              >
                <Phone className="w-5 h-5 text-[#6ab3f3]" />
              </button>
            )}
            
            {/* Video call button */}
            {!isGroup && (
              <button
                onClick={handleStartVideoCall}
                className="p-2 rounded-full hover:bg-white/10 active:bg-white/15 transition-colors"
                aria-label="Видеозвонок"
              >
                <Video className="w-5 h-5 text-[#6ab3f3]" />
              </button>
            )}
          </div>
        </div>
        
        {/* Add participants banner for groups */}
        {isGroup && (
          <button className="w-full py-2.5 px-4 bg-white/5 flex items-center justify-center gap-2 border-t border-white/5">
            <span className="text-[#6ab3f3] text-sm font-medium">Добавить участников</span>
            <span className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center">
              <X className="w-3 h-3 text-white/40" />
            </span>
          </button>
        )}
      </div>

      {/* Messages - scrollable with animated brand background */}
      <div className="flex-1 overflow-y-auto native-scroll flex flex-col relative">
        {/* Brand background - fixed to cover full screen */}
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0d2035] to-[#071420]" />
          <div 
            className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[120px] opacity-60"
            style={{
              background: 'radial-gradient(circle, #0066CC 0%, transparent 70%)',
              animation: 'float-orb-1 15s ease-in-out infinite',
            }}
          />
          <div 
            className="absolute bottom-20 right-0 w-[450px] h-[450px] rounded-full blur-[100px] opacity-50"
            style={{
              background: 'radial-gradient(circle, #00A3B4 0%, transparent 70%)',
              animation: 'float-orb-2 18s ease-in-out infinite',
              animationDelay: '-5s',
            }}
          />
          <div 
            className="absolute top-1/3 -right-20 w-[400px] h-[400px] rounded-full blur-[90px] opacity-55"
            style={{
              background: 'radial-gradient(circle, #00C896 0%, transparent 70%)',
              animation: 'float-orb-3 20s ease-in-out infinite',
              animationDelay: '-10s',
            }}
          />
          <div 
            className="absolute bottom-1/3 -left-10 w-[350px] h-[350px] rounded-full blur-[80px] opacity-45"
            style={{
              background: 'radial-gradient(circle, #4FD080 0%, transparent 70%)',
              animation: 'float-orb-4 22s ease-in-out infinite',
              animationDelay: '-3s',
            }}
          />
        </div>
        
        {/* Content layer */}
        <div className="relative z-10 flex-1 flex flex-col p-4">
        {/* Spacer to push messages to bottom */}
        <div className="flex-1" />
        
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex items-center justify-center py-8 text-center">
            <p className="text-muted-foreground">Начните переписку!</p>
          </div>
        )}
        
        <div className="space-y-1">

        {messages.map((message, index) => {
          const isOwn = message.sender_id === user?.id;
          const isVoice = message.media_type === 'voice';
          const isVideoCircle = message.media_type === 'video_circle';
          const isImage = message.media_type === 'image';
          const isVideo = message.media_type === 'video';
          const isSharedPost = !!message.shared_post_id;
          const isSharedReel = !!message.shared_reel_id;
          const isRead = message.is_read;

          // Group messages - show avatar only for first in sequence
          const prevMessage = index > 0 ? messages[index - 1] : null;
          const showAvatar = !isOwn && (!prevMessage || prevMessage.sender_id !== message.sender_id);
          const showSenderName = isGroup && !isOwn && showAvatar;

          // Hide message if it's currently shown in context menu
          const isInContextMenu = contextMenuMessage?.id === message.id;

          return (
            <div
              key={message.id}
              className={`flex items-end gap-2 ${isOwn ? "justify-end" : "justify-start"} ${isInContextMenu ? "opacity-0" : ""}`}
            >
              {/* Avatar for incoming messages */}
              {!isOwn && (
                <div className="w-8 shrink-0">
                  {showAvatar && (
                    <img 
                      src={chatAvatar} 
                      alt="" 
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  )}
                </div>
              )}

              {isSharedReel && message.shared_reel_id ? (
                <div className="flex flex-col gap-1">
                  <SharedReelCard 
                    reelId={message.shared_reel_id} 
                    isOwn={isOwn} 
                    messageId={message.id}
                    onDelete={async (msgId) => {
                      const result = await deleteMessage(msgId);
                      if (result.error) {
                        toast.error("Не удалось удалить сообщение");
                      }
                    }}
                  />
                  <div className={`flex items-center gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                    <span className="text-[11px] text-white/50">{formatMessageTime(message.created_at)}</span>
                    {isOwn && (
                      <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />
                    )}
                  </div>
                </div>
              ) : isSharedPost && message.shared_post_id ? (
                <div className="flex flex-col gap-1">
                  <SharedPostCard 
                    postId={message.shared_post_id} 
                    isOwn={isOwn} 
                    messageId={message.id}
                    onDelete={async (msgId) => {
                      const result = await deleteMessage(msgId);
                      if (result.error) {
                        toast.error("Не удалось удалить сообщение");
                      }
                    }}
                  />
                  <div className={`flex items-center gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                    <span className="text-[11px] text-white/50">{formatMessageTime(message.created_at)}</span>
                    {isOwn && (
                      <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />
                    )}
                  </div>
                </div>
              ) : isVideoCircle && message.media_url ? (
                <div className="flex flex-col items-center gap-1">
                  <VideoCircleMessage
                    videoUrl={message.media_url}
                    duration={String(message.duration_seconds || 0)}
                    isOwn={isOwn}
                  />
                  <span className="text-[10px] text-white/50">{formatMessageTime(message.created_at)}</span>
                </div>
              ) : isImage && message.media_url ? (
                <div 
                  className={`max-w-[75%] rounded-2xl overflow-hidden cursor-pointer backdrop-blur-xl ${
                    isOwn 
                      ? "rounded-br-md bg-white/10 border border-white/10" 
                      : "rounded-bl-md bg-white/5 border border-white/10"
                  }`}
                  style={{
                    boxShadow: isOwn 
                      ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 20px rgba(0,0,0,0.25)'
                      : 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.2)'
                  }}
                  onClick={() => setViewingImage(message.media_url!)}
                >
                  <img 
                    src={message.media_url} 
                    alt="Изображение" 
                    className="max-w-full h-auto"
                  />
                  <div className="px-3 py-1.5 flex items-center justify-end gap-1">
                    <span className="text-[11px] text-white/50">{formatMessageTime(message.created_at)}</span>
                    {isOwn && (
                      <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />
                    )}
                  </div>
                </div>
              ) : isVideo && message.media_url ? (
                <div className="flex flex-col gap-1">
                  <VideoPlayer
                    src={message.media_url}
                    isOwn={isOwn}
                    onFullscreen={() => setViewingVideo(message.media_url!)}
                  />
                  <div className={`flex items-center gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                    <span className="text-[11px] text-white/50">{formatMessageTime(message.created_at)}</span>
                    {isOwn && (
                      <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 select-none backdrop-blur-xl border border-white/10 ${
                    isOwn
                      ? "bg-white/10 text-white rounded-br-sm"
                      : "bg-white/5 text-white rounded-bl-sm"
                  }`}
                  style={{
                    boxShadow: isOwn 
                      ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 20px rgba(0,0,0,0.25)'
                      : 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.2)'
                  }}
                  onMouseDown={(e) => handleMessageLongPressStart(message.id, message.content, isOwn, e)}
                  onMouseUp={handleMessageLongPressEnd}
                  onMouseLeave={handleMessageLongPressEnd}
                  onTouchStart={(e) => handleMessageLongPressStart(message.id, message.content, isOwn, e)}
                  onTouchEnd={handleMessageLongPressEnd}
                >
                  {/* Sender name for group chats */}
                  {showSenderName && (
                    <p className="text-[13px] font-medium text-[#6ab3f3] mb-0.5">Эдгар</p>
                  )}
                  
                  {isVoice ? (
                    <div className="flex items-center gap-3 min-w-[180px]">
                      <button
                        className="w-10 h-10 shrink-0 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/15 transition-colors"
                        onClick={() => toggleVoicePlay(message.id, message.media_url || undefined)}
                      >
                        {playingVoice === message.id ? (
                          <Pause className="w-5 h-5 text-white" />
                        ) : (
                          <Play className="w-5 h-5 text-white ml-0.5" />
                        )}
                      </button>
                      <div className="flex-1 flex items-center gap-[2px]">
                        {getWaveformHeights(message.id).map((height, i) => (
                          <div
                            key={i}
                            className={`w-[3px] rounded-full transition-all duration-150 ${
                              playingVoice === message.id ? 'bg-white/80' : 'bg-white/40'
                            }`}
                            style={{ 
                              height: `${height}px`,
                              animationDelay: playingVoice === message.id ? `${i * 50}ms` : undefined
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-white/60 font-medium">
                        {message.duration_seconds ? formatTime(message.duration_seconds) : "0:00"}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[15px] leading-[1.4] whitespace-pre-wrap">{message.content}</p>
                  )}
                  
                  {/* Time and read status */}
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[11px] text-white/40">{formatMessageTime(message.created_at)}</span>
                    {isOwn && (
                      <CheckCheck className={`w-4 h-4 ${isRead ? 'text-[#6ab3f3]' : 'text-white/40'}`} />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        </div>
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area - Fully transparent like Telegram */}
      <div className="flex-shrink-0 relative z-10">
        
        {/* Input controls */}
        <div className="px-3 py-3">
          {isRecording ? (
            <div className="flex items-center gap-3">
              <button 
                onClick={cancelRecording}
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 backdrop-blur-xl border border-white/10"
                style={{
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.3)'
                }}
              >
                <X className="w-5 h-5 text-white/70" />
              </button>
              
              <div 
                className="flex-1 flex items-center gap-3 h-12 px-5 rounded-full backdrop-blur-xl border border-white/10"
                style={{
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.3)'
                }}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm text-white/70">
                  Запись... {formatTime(recordingTime)}
                </span>
              </div>
              
              <button
                onClick={stopRecording}
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #00A3B4 0%, #0066CC 50%, #00C896 100%)',
                  boxShadow: '0 0 20px rgba(0,163,180,0.4), 0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                <Send className="w-5 h-5 text-white" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {/* Input field - dark transparent like Telegram */}
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Сообщение"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  onFocus={() => setShowEmojiPicker(false)}
                  className="w-full h-11 px-5 pr-20 rounded-full text-white placeholder:text-white/50 outline-none bg-black/40 border-0 transition-all"
                />
                {/* Icons inside input */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={`transition-colors ${showEmojiPicker ? 'text-cyan-400' : 'text-white/50 hover:text-white/70'}`}
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setShowAttachmentSheet(true)}
                    className="text-white/50 hover:text-white/70 transition-colors"
                  >
                    <AttachmentIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Right button - Dynamic based on text and record mode */}
              {inputText.trim() ? (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSendMessage}
                  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #00A3B4 0%, #0066CC 50%, #00C896 100%)',
                    boxShadow: '0 0 25px rgba(0,163,180,0.5), 0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
                  }}
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
              ) : (
                <button
                  onTouchStart={handleRecordButtonDown}
                  onTouchEnd={handleRecordButtonUp}
                  onMouseDown={handleRecordButtonDown}
                  onMouseUp={handleRecordButtonUp}
                  onMouseLeave={handleRecordButtonLeave}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all backdrop-blur-xl border border-cyan-400/30 select-none"
                  style={{
                    background: recordMode === 'video' 
                      ? 'linear-gradient(145deg, rgba(139,92,246,0.3) 0%, rgba(0,102,204,0.2) 100%)'
                      : 'linear-gradient(145deg, rgba(0,163,180,0.3) 0%, rgba(0,102,204,0.2) 100%)',
                    boxShadow: '0 0 20px rgba(0,163,180,0.3), inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 20px rgba(0,0,0,0.3)'
                  }}
                >
                  {recordMode === 'voice' ? (
                    <Mic className="w-5 h-5 text-cyan-300" />
                  ) : (
                    <Video className="w-5 h-5 text-purple-300" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* Emoji Picker - Telegram style inline below input */}
        <EmojiStickerPicker
          open={showEmojiPicker}
          onOpenChange={setShowEmojiPicker}
          onEmojiSelect={(emoji) => {
            setInputText((prev) => prev + emoji);
          }}
        />
      </div>
      
      {/* Safe area for bottom - transparent */}
      {!showEmojiPicker && <div className="safe-area-bottom" />}

      {/* Video Circle Recorder */}
      {showVideoRecorder && (
        <VideoCircleRecorder
          onRecord={handleVideoRecord}
          onCancel={() => setShowVideoRecorder(false)}
        />
      )}

      {/* Attachment Sheet */}
      <AttachmentSheet
        open={showAttachmentSheet}
        onOpenChange={setShowAttachmentSheet}
        onSelectFile={handleAttachment}
      />


      {/* Image Viewer */}
      {viewingImage && (
        <ImageViewer
          src={viewingImage}
          onClose={() => setViewingImage(null)}
        />
      )}

      {/* Fullscreen Video Player */}
      {viewingVideo && (
        <FullscreenVideoPlayer
          src={viewingVideo}
          onClose={() => setViewingVideo(null)}
        />
      )}

      {/* Message Context Menu */}
      {contextMenuMessage && (
        <MessageContextMenu
          isOpen={!!contextMenuMessage}
          onClose={() => setContextMenuMessage(null)}
          messageId={contextMenuMessage.id}
          messageContent={contextMenuMessage.content}
          isOwn={contextMenuMessage.isOwn}
          position={contextMenuMessage.position}
          onDelete={handleMessageDelete}
          onPin={handleMessagePin}
          onReaction={handleMessageReaction}
          onReply={handleMessageReply}
          onForward={handleMessageForward}
        />
      )}

    </div>
  );
}
