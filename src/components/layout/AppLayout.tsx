import { useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { ScrollContainerProvider } from "@/contexts/ScrollContainerContext";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { cn } from "@/lib/utils";
import { usePresence } from "@/hooks/usePresence";
import { CreateContentModal } from "@/components/feed/CreateContentModal";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { ContentType } from "@/hooks/useMediaEditor";

export function AppLayout() {
  usePresence();

  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { shouldHideBottomNav, isCreatingContent } = useChatOpen();
  const isReelsPage = location.pathname === "/reels";
  const isFullWidthPage =
    location.pathname.startsWith("/profile") ||
    location.pathname.startsWith("/user/") ||
    location.pathname.startsWith("/contact/");
  const [createOpen, setCreateOpen] = useState(false);

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
            isReelsPage ? "overflow-hidden" : "overflow-y-auto",
            !isReelsPage && "pb-20"
          )}
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            isolation: 'isolate',
          }}
        >
          <Outlet />
        </main>
      </ScrollContainerProvider>

      <CreateContentModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={(contentType: ContentType) => {
          toast.success('Контент готов к публикации');
          setCreateOpen(false);
        }}
      />

      <BottomNav hidden={shouldHideBottomNav} />
      {/* Call UI is now handled globally by GlobalCallOverlay in App.tsx */}
    </div>
  );
}
