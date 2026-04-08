import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface UseChatInteractionParams {
  conversationId: string;
  otherUserId: string;
  chatName: string;
  chatAvatar: string | null;
  recordMode: "voice" | "video";
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  setShowVideoRecorder: (v: boolean) => void;
  setRecordMode: React.Dispatch<React.SetStateAction<"voice" | "video">>;
  sendTyping: (isTyping: boolean, activity?: "typing" | "recording_voice" | "recording_video") => void;
  startCall: (userId: string, convId: string, type: "audio" | "video", meta: { display_name: string; avatar_url: string | null }) => Promise<unknown>;
  setContextMenuMessage: React.Dispatch<React.SetStateAction<{
    id: string;
    content: string;
    isOwn: boolean;
    position: { top: number; left: number; width: number };
  } | null>>;
}

export function useChatInteraction({
  conversationId, otherUserId, chatName, chatAvatar,
  recordMode, isRecording, startRecording, stopRecording,
  setShowVideoRecorder, setRecordMode, sendTyping,
  startCall, setContextMenuMessage,
}: UseChatInteractionParams) {
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);
  const holdStartedRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleStartAudioCall = async () => {
    try {
      await startCall(otherUserId, conversationId, "audio", { display_name: chatName, avatar_url: chatAvatar });
    } catch (err) {
      logger.error("chat: audio call start failed", { conversationId, error: err });
      toast.error("Не удалось начать аудиозвонок");
    }
  };

  const handleStartVideoCall = async () => {
    try {
      await startCall(otherUserId, conversationId, "video", { display_name: chatName, avatar_url: chatAvatar });
    } catch (err) {
      logger.error("chat: video call start failed", { conversationId, error: err });
      toast.error("Не удалось начать видеозвонок");
    }
  };

  const handleRecordButtonDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (activePointerIdRef.current !== null) return;
    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (error) {
      logger.debug("chat: pointer capture not available", { conversationId, error });
    }
    isHoldingRef.current = false;
    holdStartedRef.current = true;

    holdTimerRef.current = setTimeout(() => {
      isHoldingRef.current = true;
      if (recordMode === "voice") {
        startRecording();
      } else {
        setShowVideoRecorder(true);
        sendTyping(true, "recording_video");
      }
    }, 200);
  }, [recordMode, sendTyping, startRecording, conversationId, setShowVideoRecorder]);

  const handleRecordButtonUp = useCallback((e?: React.PointerEvent<HTMLButtonElement>) => {
    if (e && activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    if (!holdStartedRef.current) return;
    holdStartedRef.current = false;
    activePointerIdRef.current = null;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (isHoldingRef.current) {
      if (recordMode === "voice" && isRecording) stopRecording();
      if (recordMode === "video") sendTyping(false, "recording_video");
    } else {
      setRecordMode(prev => prev === "voice" ? "video" : "voice");
    }
    isHoldingRef.current = false;
  }, [recordMode, isRecording, stopRecording, sendTyping, setRecordMode]);

  const handleRecordButtonLeave = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const handleMessageLongPressStart = useCallback((
    messageId: string,
    content: string,
    isOwn: boolean,
    event: React.MouseEvent | React.TouchEvent,
  ) => {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    longPressTimerRef.current = setTimeout(() => {
      setContextMenuMessage({
        id: messageId, content, isOwn,
        position: { top: rect.top, left: rect.left, width: rect.width },
      });
    }, 500);
  }, [setContextMenuMessage]);

  const handleMessageLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  return {
    handleStartAudioCall,
    handleStartVideoCall,
    handleRecordButtonDown,
    handleRecordButtonUp,
    handleRecordButtonLeave,
    handleMessageLongPressStart,
    handleMessageLongPressEnd,
  };
}
