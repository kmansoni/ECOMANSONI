import { useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { cn } from "@/lib/utils";
import { usePresence } from "@/hooks/usePresence";

export function AppLayout() {
  usePresence();

  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const { shouldHideBottomNav } = useChatOpen();
  const isFullWidthPage =
    location.pathname.startsWith("/profile") ||
    location.pathname.startsWith("/user/") ||
    location.pathname.startsWith("/contact/");

  return (
    <div 
      className={cn(
        "AppShell h-full flex flex-col safe-area-left safe-area-right relative bg-transparent"
      )}
      style={{ 
        position: 'relative',
        overflow: 'hidden',
      }}
    >

      <ScrollContainerProvider value={mainRef}>
        <main 
          ref={mainRef}
          className={cn(
            "flex-1 overflow-x-hidden w-full native-scroll relative z-10",
            isFullWidthPage ? "max-w-none" : "max-w-lg mx-auto",
            "overflow-y-auto",
            "pb-20"
          )}
          style={{
            WebkitOverflowScrolling: 'touch' as const,
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            isolation: 'isolate',
          }}
        >
          <Outlet />
        </main>
      </ScrollContainerProvider>

      <BottomNav
        hidden={shouldHideBottomNav}
        disableHideAnimation={false}
      />
      {/* Call UI is now handled globally by GlobalCallOverlay in App.tsx */}
    </div>
  );
}
