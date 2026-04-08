import { useRef, useEffect } from "react";

interface UseChatLifecycleParams {
  conversationId: string;
  inputText: string;
  setInputText: (v: string) => void;
  setIsChatOpen: (v: boolean) => void;
  getDraft: (id: string) => string | null;
  saveDraft: (id: string, text: string) => void;
  clearDraft: (id: string) => void;
  initialOpenPanelAction?: "settings" | "timer" | "scheduled";
  onInitialPanelHandled?: () => void;
  setShowChatSettings: (v: boolean) => void;
  setShowTimerPicker: (v: boolean) => void;
  setShowScheduledList: (v: boolean) => void;
}

export function useChatLifecycle({
  conversationId, inputText, setInputText, setIsChatOpen,
  getDraft, saveDraft, clearDraft,
  initialOpenPanelAction, onInitialPanelHandled,
  setShowChatSettings, setShowTimerPicker, setShowScheduledList,
}: UseChatLifecycleParams) {
  // Mark chat view as open/closed (hides bottom nav)
  useEffect(() => {
    setIsChatOpen(true);
    return () => setIsChatOpen(false);
  }, [setIsChatOpen]);

  // Draft: track current text via ref for cleanup
  const inputTextRef = useRef("");
  useEffect(() => { inputTextRef.current = inputText; }, [inputText]);

  useEffect(() => {
    const saved = getDraft(conversationId);
    if (saved) setInputText(saved);
    return () => {
      const current = inputTextRef.current.trim();
      if (current) saveDraft(conversationId, current);
      else clearDraft(conversationId);
    };
  }, [conversationId, getDraft, saveDraft, clearDraft]);

  // Open initial panel from navigation params
  const handledPanelActionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialOpenPanelAction) return;
    const key = `${conversationId}:${initialOpenPanelAction}`;
    if (handledPanelActionRef.current === key) return;
    handledPanelActionRef.current = key;
    if (initialOpenPanelAction === "settings") setShowChatSettings(true);
    if (initialOpenPanelAction === "timer") setShowTimerPicker(true);
    if (initialOpenPanelAction === "scheduled") setShowScheduledList(true);
    onInitialPanelHandled?.();
  }, [conversationId, initialOpenPanelAction, onInitialPanelHandled]);
}
