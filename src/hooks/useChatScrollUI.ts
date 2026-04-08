import { useState, useEffect, type RefObject } from "react";
import type { ChatMessage } from "@/hooks/useChat";

interface Params {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  aiStreamText: string | null;
}

export function useChatScrollUI({ scrollContainerRef, messagesEndRef, messages, aiStreamText }: Params) {
  const [floatingDate, setFloatingDate] = useState<Date | null>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiStreamText]);

  // Scroll handler for floating date + FAB
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollFab(dist > 300);

      const seps = el.querySelectorAll<HTMLElement>("[data-date-id]");
      let topmost: { node: HTMLElement; top: number } | null = null;
      const containerTop = el.getBoundingClientRect().top;
      seps.forEach((sep) => {
        const t = sep.getBoundingClientRect().top;
        if (t <= containerTop + 4 && (!topmost || t > topmost.top)) {
          topmost = { node: sep, top: t };
        }
      });
      if (topmost) {
        const id = (topmost as { node: HTMLElement }).node.getAttribute("data-date-id");
        if (id) setFloatingDate(new Date(id));
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return { floatingDate, showScrollFab };
}
